import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.config import settings
from app.dependencies import get_optional_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/render", tags=["render"])


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


async def _proxy_render(source: str, format: str) -> httpx.Response:
    """Send PlantUML source to the PlantUML server for rendering."""
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


def _inject_dpi(source: str, dpi: int) -> str:
    """Inject a skinparam dpi directive for high-res PNG rendering.

    Only @startuml (and sourceless input, which PlantUML treats as implicit
    UML) accepts a skinparam directive. For data diagrams — @startjson,
    @startyaml, @startditaa, @startmath, … — the body is literal data and an
    injected skinparam line would make it unparseable, so those are left as-is.
    """
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
    source = _inject_dpi(body.source, 300)
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
