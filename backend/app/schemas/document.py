from datetime import datetime
from typing import Any

from pydantic import BaseModel, model_validator


# --- Shared sub-models ---

class UserBrief(BaseModel):
    id: int
    display_name: str


class UserBriefWithUsername(BaseModel):
    id: int
    display_name: str
    username: str


class FolderBrief(BaseModel):
    id: int
    name: str


# --- Request schemas ---

class DocumentCreateRequest(BaseModel):
    title: str | None = None
    folder_id: int | None = None
    content: str | None = None
    template_id: int | None = None


_UNSET = object()


class DocumentUpdateRequest(BaseModel):
    title: str | None = None
    folder_id: int | None | Any = _UNSET  # _UNSET means not provided; None means move to root

    @model_validator(mode="before")
    @classmethod
    def track_folder_id(cls, data: Any) -> Any:
        """Distinguish between folder_id not sent vs folder_id: null."""
        if isinstance(data, dict) and "folder_id" not in data:
            data["folder_id"] = _UNSET
        return data

    @property
    def folder_id_provided(self) -> bool:
        return self.folder_id is not _UNSET


class DocumentContentUpdateRequest(BaseModel):
    content: str


class DocumentDuplicateRequest(BaseModel):
    title: str | None = None
    folder_id: int | None = None


# --- Response schemas ---

class DocumentListItem(BaseModel):
    id: int
    title: str
    folder: FolderBrief | None = None
    permission: str
    is_shared: bool
    last_edited_by: UserBrief | None = None
    shared_by: UserBrief | None = None
    created_at: datetime
    updated_at: datetime


class DocumentListResponse(BaseModel):
    items: list[DocumentListItem]
    total: int
    limit: int
    offset: int


class DocumentDetailResponse(BaseModel):
    id: int
    title: str
    folder: FolderBrief | None = None
    permission: str
    is_shared: bool
    content: str
    version_number: int
    owner: UserBriefWithUsername
    last_edited_by: UserBrief | None = None
    created_at: datetime
    updated_at: datetime


class DocumentCreateResponse(BaseModel):
    id: int
    title: str
    folder: FolderBrief | None = None
    permission: str
    is_shared: bool
    content: str
    version_number: int
    created_at: datetime
    updated_at: datetime


class ContentUpdateResponse(BaseModel):
    version_number: int
    content_hash: str
    created_version: bool
