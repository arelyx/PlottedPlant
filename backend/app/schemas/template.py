from pydantic import BaseModel


class TemplateListItem(BaseModel):
    id: int
    name: str
    description: str
    diagram_type: str
    sort_order: int


class TemplateDetail(BaseModel):
    id: int
    name: str
    description: str
    diagram_type: str
    content: str
    sort_order: int


class TemplateListResponse(BaseModel):
    items: list[TemplateListItem]
