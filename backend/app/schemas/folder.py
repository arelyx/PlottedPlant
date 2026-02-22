from datetime import datetime

from pydantic import BaseModel


# --- Shared sub-models ---

class UserBrief(BaseModel):
    id: int
    display_name: str


class DocumentInFolder(BaseModel):
    id: int
    title: str
    updated_at: datetime
    last_edited_by: UserBrief | None = None


# --- Request schemas ---

class FolderCreateRequest(BaseModel):
    name: str


class FolderUpdateRequest(BaseModel):
    name: str


# --- Response schemas ---

class FolderResponse(BaseModel):
    id: int
    name: str
    permission: str
    document_count: int
    shared_by: UserBrief | None = None
    is_shared: bool
    created_at: datetime
    updated_at: datetime


class FolderDetailResponse(BaseModel):
    id: int
    name: str
    permission: str
    is_shared: bool
    created_at: datetime
    updated_at: datetime
    documents: list[DocumentInFolder]


class FolderListResponse(BaseModel):
    items: list[FolderResponse]
