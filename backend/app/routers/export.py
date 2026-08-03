import logging
import re
import unicodedata
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user_id, get_db, parse_document_uuid
from app.routers.render import classify_render_response
from app.services.document import get_document_with_permission, resolve_document_internal_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/documents", tags=["export"])


def _slugify(title: str) -> str:
    """Convert a document title to an ASCII, filename-safe slug.

    Non-ASCII characters (CJK, accented Latin, emoji, ...) are folded to
    their closest ASCII equivalent where possible (e.g. "café" -> "cafe")
    and dropped otherwise, so the result is always safe to embed in a
    latin-1-encoded `Content-Disposition` header.
    """
    ascii_title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii")
    slug = ascii_title.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "diagram"


def _content_disposition(title: str, ext: str) -> str:
    """Build a `Content-Disposition: attachment` header value for an export.

    Includes a sanitized ASCII `filename=` (always latin-1 safe, for clients
    without RFC 5987 support) alongside a `filename*=UTF-8''...` form that
    carries the original, non-ASCII-preserving title for clients that do.
    """
    ascii_filename = f"{_slugify(title)}.{ext}"
    utf8_filename = f"{title.strip() or 'diagram'}.{ext}"
    encoded_utf8_filename = quote(utf8_filename, safe="")
    return f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_utf8_filename}'


async def _render_for_export(source: str, fmt: str) -> bytes:
    """Render PlantUML source via the internal server."""
    url = f"{settings.plantuml_server_url}/{fmt}/"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                content=source.encode("utf-8"),
                headers={"Content-Type": "text/plain; charset=utf-8"},
            )
    except httpx.RequestError as e:
        logger.error("PlantUML server request failed: %s", e)
        raise HTTPException(status_code=502, detail="PlantUML server unavailable")

    # A syntax error in the document is a client error (422), not a gateway
    # failure. classify_render_response raises 502 only for a genuine upstream
    # problem (non-image error body); a bad diagram returns a syntax-error dict.
    error = classify_render_response(response)
    if error:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "PLANTUML_SYNTAX_ERROR", **error}},
        )
    return response.content


async def _get_doc_for_export(document_id: str, user_id: int, db):
    """Resolve UUID and get document with permission check."""
    doc_uuid = parse_document_uuid(document_id)
    internal_id = await resolve_document_internal_id(db, doc_uuid)
    if internal_id is None:
        raise HTTPException(status_code=404, detail="Document not found")
    doc, permission = await get_document_with_permission(db, internal_id, user_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/{document_id}/export/svg")
async def export_svg(
    document_id: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Export document as SVG file."""
    doc = await _get_doc_for_export(document_id, user_id, db)

    content = await _render_for_export(doc.current_content, "svg")

    return Response(
        content=content,
        media_type="image/svg+xml",
        headers={"Content-Disposition": _content_disposition(doc.title, "svg")},
    )


@router.post("/{document_id}/export/png")
async def export_png(
    document_id: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Export document as PNG file."""
    doc = await _get_doc_for_export(document_id, user_id, db)

    content = await _render_for_export(doc.current_content, "png")

    return Response(
        content=content,
        media_type="image/png",
        headers={"Content-Disposition": _content_disposition(doc.title, "png")},
    )


@router.post("/{document_id}/export/pdf")
async def export_pdf(
    document_id: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Export document as PDF file."""
    doc = await _get_doc_for_export(document_id, user_id, db)

    content = await _render_for_export(doc.current_content, "pdf")

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(doc.title, "pdf")},
    )


@router.post("/{document_id}/export/source")
async def export_source(
    document_id: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Export document as PlantUML source file."""
    doc = await _get_doc_for_export(document_id, user_id, db)

    return Response(
        content=doc.current_content.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": _content_disposition(doc.title, "puml")},
    )
