import logging
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user_id, get_db, parse_document_uuid
from app.services.document import get_document_with_permission, resolve_document_internal_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/documents", tags=["export"])


def _slugify(title: str) -> str:
    """Convert a document title to a filename-safe slug."""
    slug = title.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "diagram"


async def _render_for_export(source: str, fmt: str) -> bytes:
    """Render PlantUML source via the internal server."""
    url = f"{settings.plantuml_server_url}/{fmt}/"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            content=source.encode("utf-8"),
            headers={"Content-Type": "text/plain; charset=utf-8"},
        )
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="PlantUML rendering failed")
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
    filename = f"{_slugify(doc.title)}.svg"

    return Response(
        content=content,
        media_type="image/svg+xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
    filename = f"{_slugify(doc.title)}.png"

    return Response(
        content=content,
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
    filename = f"{_slugify(doc.title)}.pdf"

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{document_id}/export/source")
async def export_source(
    document_id: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Export document as PlantUML source file."""
    doc = await _get_doc_for_export(document_id, user_id, db)

    filename = f"{_slugify(doc.title)}.puml"

    return Response(
        content=doc.current_content.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
