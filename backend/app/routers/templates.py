from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.template import Template
from app.schemas.template import TemplateDetail, TemplateListItem, TemplateListResponse

router = APIRouter(prefix="/api/v1/templates", tags=["templates"])


@router.get("", response_model=TemplateListResponse)
async def list_templates(
    diagram_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List all templates, optionally filtered by diagram type."""
    query = select(
        Template.id,
        Template.name,
        Template.description,
        Template.diagram_type,
        Template.sort_order,
    ).order_by(Template.diagram_type, Template.sort_order, Template.id)

    if diagram_type:
        query = query.where(Template.diagram_type == diagram_type)

    result = await db.execute(query)
    items = [
        TemplateListItem(
            id=row.id,
            name=row.name,
            description=row.description,
            diagram_type=row.diagram_type,
            sort_order=row.sort_order,
        )
        for row in result.all()
    ]

    return TemplateListResponse(items=items)


@router.get("/{template_id}", response_model=TemplateDetail)
async def get_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get a single template with its content."""
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()

    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    return TemplateDetail(
        id=template.id,
        name=template.name,
        description=template.description,
        diagram_type=template.diagram_type,
        content=template.content,
        sort_order=template.sort_order,
    )
