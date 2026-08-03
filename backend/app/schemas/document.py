from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.validators import NoNulStr


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

# BIGINT column bound (folders.id, documents.folder_id are BigInteger).
_BIGINT_MAX = 9223372036854775807


class DocumentCreateRequest(BaseModel):
    title: NoNulStr | None = Field(default=None, max_length=255)
    folder_id: int | None = Field(default=None, ge=1, le=_BIGINT_MAX)
    content: NoNulStr | None = Field(default=None, max_length=500_000)
    template_id: int | None = None


class DocumentUpdateRequest(BaseModel):
    title: NoNulStr | None = Field(default=None, max_length=255)
    # None means "move to root"; absent means "leave unchanged" — distinguished
    # via model_fields_set below rather than a sentinel typed as Any, which
    # accepted any JSON value (e.g. a string) and 500'd downstream.
    folder_id: int | None = Field(default=None, ge=1, le=_BIGINT_MAX)

    @property
    def folder_id_provided(self) -> bool:
        return "folder_id" in self.model_fields_set


class DocumentContentUpdateRequest(BaseModel):
    content: NoNulStr = Field(max_length=500_000)


class DocumentDuplicateRequest(BaseModel):
    title: NoNulStr | None = Field(default=None, max_length=255)
    folder_id: int | None = Field(default=None, ge=1, le=_BIGINT_MAX)


# --- Response schemas ---

class DocumentListItem(BaseModel):
    id: str
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
    id: str
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
    id: str
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
