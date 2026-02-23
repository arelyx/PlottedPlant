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

    error = _parse_plantuml_error(response.headers)
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
    """Inject skinparam dpi directive after @startuml for high-res PNG export."""
    directive = f"skinparam dpi {dpi}\n"
    # Insert right after the @start line (e.g. @startuml, @startjson, etc.)
    for i, line in enumerate(source.split("\n")):
        if line.strip().lower().startswith("@start"):
            lines = source.split("\n")
            lines.insert(i + 1, f"skinparam dpi {dpi}")
            return "\n".join(lines)
    # No @start found — prepend the directive
    return directive + source


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

    error = _parse_plantuml_error(response.headers)
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
    """Validate PlantUML syntax without full render."""
    try:
        response = await _proxy_render(body.source, "check")
    except httpx.RequestError as e:
        logger.error("PlantUML server request failed: %s", e)
        raise HTTPException(status_code=502, detail="PlantUML server unavailable")

    error = _parse_plantuml_error(response.headers)
    if error:
        return CheckResponse(valid=False, error=error)

    return CheckResponse(valid=True)
