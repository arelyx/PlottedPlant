import logging
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.config import settings
from app.dependencies import get_optional_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/render", tags=["render"])

# Mirrors docker-compose.yml's `PLANTUML_LIMIT_SIZE=16384` on the plantuml
# service. The renderer silently clamps any dimension that would exceed this
# to the limit instead of failing, so we have to detect the clamp ourselves
# (see check_png_not_truncated below).
PLANTUML_IMAGE_LIMIT_PX = 16384

# Complements RenderRequest's 500_000-character pydantic cap. That limit is on
# decoded characters; a multibyte-heavy body (e.g. emoji) can be legal by that
# cap yet several MB on the wire. nginx already enforces `client_max_body_size
# 1m` in front of the service, but a caller that reaches the backend directly
# (bypassing nginx) has no byte guard at all, so we enforce one here too.
MAX_SOURCE_BYTES = 1_000_000


class RenderRequest(BaseModel):
    source: str = Field(max_length=500_000)


class CheckResponse(BaseModel):
    valid: bool
    error: dict | None = None


def _parse_plantuml_error(headers: httpx.Headers) -> dict | None:
    """Parse error information from PlantUML server response headers."""
    error_msg = headers.get("X-PlantUML-Diagram-Error")
    error_line = headers.get("X-PlantUML-Diagram-Error-Line")
    if error_msg:
        result = {"message": error_msg}
        if error_line:
            try:
                result["line"] = int(error_line)
            except ValueError:
                pass
        return result
    return None


def check_source_size(source: str) -> None:
    """Reject a source whose UTF-8 byte length exceeds MAX_SOURCE_BYTES.

    RenderRequest.source is capped at 500_000 *characters*, but multibyte
    characters make the byte size far larger than the character count. nginx
    guards the byte size in front of the service, but a caller hitting the
    backend directly has no such guard, so we enforce one here too.
    """
    size = len(source.encode("utf-8"))
    if size > MAX_SOURCE_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "error": {
                    "code": "SOURCE_TOO_LARGE",
                    "message": f"source exceeds the maximum size of {MAX_SOURCE_BYTES} bytes",
                }
            },
        )


async def _proxy_render(source: str, format: str) -> httpx.Response:
    """Send PlantUML source to the PlantUML server for rendering."""
    check_source_size(source)
    url = f"{settings.plantuml_server_url}/{format}/"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            content=source.encode("utf-8"),
            headers={"Content-Type": "text/plain; charset=utf-8"},
        )
    return response


def classify_render_response(response: httpx.Response) -> dict | None:
    """
    Classify a PlantUML response. Returns a syntax-error dict for a bad diagram,
    or None if the render succeeded. Raises 502 for a genuine upstream failure.

    PlantUML signals syntax errors two ways: sometimes with the structured
    X-PlantUML-Diagram-Error header, sometimes as a plain non-200 whose body is
    still a rendered error *image*. Both are user errors (422 / valid:false). A
    non-200 whose body is NOT an image (jetty HTML error page, OOM, body-limit
    rejection) is a gateway failure — without this distinction the caller would
    hand that error body back as a 200 mislabeled image.
    """
    error = _parse_plantuml_error(response.headers)
    if error:
        return error
    if response.status_code == 200:
        return None
    content_type = response.headers.get("content-type", "")
    if content_type.startswith("image/"):
        return {"message": "Syntax error"}
    logger.error(
        "PlantUML returned %s with content-type %r",
        response.status_code,
        content_type,
    )
    raise HTTPException(status_code=502, detail="PlantUML rendering failed")


def check_png_not_truncated(png_bytes: bytes) -> None:
    """Raise 422 if a PNG was silently clamped to the renderer's size limit.

    PlantUML caps rendered dimensions at PLANTUML_LIMIT_SIZE (see
    docker-compose.yml) and, when a diagram would exceed it, clamps the
    output to that limit and still returns 200 OK — the extra content is
    just gone, with no error signal. We detect the clamp by reading the
    width/height straight out of the PNG's IHDR chunk (PNG signature is the
    first 8 bytes; IHDR's data — 4-byte width then 4-byte height, both
    big-endian — starts at byte 16) and reject an image whose width or
    height hit the limit, since a genuinely valid diagram would only reach
    the limit by coincidence to the pixel.
    """
    if len(png_bytes) < 24 or png_bytes[:8] != b"\x89PNG\r\n\x1a\n":
        return  # not a PNG we can introspect; let it through as-is
    width = int.from_bytes(png_bytes[16:20], "big")
    height = int.from_bytes(png_bytes[20:24], "big")
    if width >= PLANTUML_IMAGE_LIMIT_PX or height >= PLANTUML_IMAGE_LIMIT_PX:
        raise HTTPException(
            status_code=422,
            detail={
                "error": {
                    "code": "PLANTUML_IMAGE_TOO_LARGE",
                    "message": "diagram exceeds the maximum renderable size",
                }
            },
        )


@router.post("/svg")
async def render_svg(
    body: RenderRequest,
    _user_id: int | None = Depends(get_optional_user_id),
):
    """Render PlantUML source as SVG."""
    try:
        response = await _proxy_render(body.source, "svg")
    except httpx.RequestError as e:
        logger.error("PlantUML server request failed: %s", e)
        raise HTTPException(status_code=502, detail="PlantUML server unavailable")

    error = classify_render_response(response)
    if error:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "PLANTUML_SYNTAX_ERROR", **error}},
        )

    return Response(
        content=response.content,
        media_type="image/svg+xml",
    )


# The DPI we render PNGs at, and also the hard ceiling no single request may
# push past. PlantUML's raster memory usage scales with dpi^2, so an
# unclamped high value (e.g. a user's own `skinparam dpi 9600`) can OOM the
# 1 GB renderer in one request.
DEFAULT_PNG_DPI = 300

_DPI_DIRECTIVE_RE = re.compile(r"^(\s*skinparam\s+dpi\s+)(\d+)(\s*)$", re.IGNORECASE)


def clamp_dpi_directives(source: str, max_dpi: int) -> str:
    """Rewrite any existing `skinparam dpi <n>` line(s) so none exceed max_dpi.

    PlantUML applies `skinparam dpi` last-wins, so simply *adding* our own
    directive doesn't stop a user's own (possibly much larger) directive
    elsewhere in the source from winning. Rewriting every existing directive
    in place — rather than appending after them — guarantees the effective
    DPI can never exceed max_dpi, regardless of how many directives exist or
    where they sit. Returns source unchanged if no such directive is present.
    """
    lines = source.split("\n")
    changed = False
    for i, line in enumerate(lines):
        m = _DPI_DIRECTIVE_RE.match(line)
        if m:
            changed = True
            existing_dpi = int(m.group(2))
            clamped = min(existing_dpi, max_dpi)
            lines[i] = f"{m.group(1)}{clamped}{m.group(3)}"
    return "\n".join(lines) if changed else source


def _inject_dpi(source: str, dpi: int) -> str:
    """Inject a skinparam dpi directive for high-res PNG rendering.

    Only @startuml (and sourceless input, which PlantUML treats as implicit
    UML) accepts a skinparam directive. For data diagrams — @startjson,
    @startyaml, @startditaa, @startmath, … — the body is literal data and an
    injected skinparam line would make it unparseable, so those are left as-is.

    A leading BOM (U+FEFF) is stripped first: `.strip()` alone doesn't remove
    it, so a BOM-prefixed source would fail the `@startuml` check below and
    silently skip injection entirely, rendering at PlantUML's ~96 DPI default
    instead of the intended `dpi`.

    Any pre-existing `skinparam dpi` directive is clamped to `dpi` (see
    clamp_dpi_directives) before we consider injecting our own, closing off
    the last-wins override that could otherwise OOM the renderer.
    """
    source = source.lstrip("﻿")
    clamped = clamp_dpi_directives(source, dpi)
    if clamped != source:
        return clamped

    directive = f"skinparam dpi {dpi}"
    lines = source.split("\n")
    for i, line in enumerate(lines):
        stripped = line.strip().lower()
        if stripped.startswith("@start"):
            if stripped.startswith("@startuml"):
                lines.insert(i + 1, directive)
                return "\n".join(lines)
            return source
    # No @start directive: PlantUML renders this as implicit UML.
    return directive + "\n" + source


@router.post("/png")
async def render_png(
    body: RenderRequest,
    _user_id: int | None = Depends(get_optional_user_id),
):
    """Render PlantUML source as PNG at high resolution (300 DPI)."""
    source = _inject_dpi(body.source, DEFAULT_PNG_DPI)
    try:
        response = await _proxy_render(source, "png")
    except httpx.RequestError as e:
        logger.error("PlantUML server request failed: %s", e)
        raise HTTPException(status_code=502, detail="PlantUML server unavailable")

    error = classify_render_response(response)
    if error:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "PLANTUML_SYNTAX_ERROR", **error}},
        )
    check_png_not_truncated(response.content)

    return Response(
        content=response.content,
        media_type="image/png",
    )


@router.post("/check", response_model=CheckResponse)
async def check_syntax(
    body: RenderRequest,
    _user_id: int | None = Depends(get_optional_user_id),
):
    """Validate PlantUML syntax without returning the rendered image.

    The PlantUML server's /check/ endpoint only supports GET (POST 405s), so we
    validate by rendering to SVG — a working POST endpoint that sets the
    diagram-error header on a syntax error — and discard the image body.
    """
    try:
        response = await _proxy_render(body.source, "svg")
    except httpx.RequestError as e:
        logger.error("PlantUML server request failed: %s", e)
        raise HTTPException(status_code=502, detail="Syntax check unavailable")

    error = classify_render_response(response)
    return CheckResponse(valid=error is None, error=error)
