from datetime import datetime

from pydantic import BaseModel, Field


class UserBrief(BaseModel):
    id: int
    display_name: str


class VersionListItem(BaseModel):
    version_number: int
    created_at: datetime
    created_by: UserBrief | None = None
    label: str | None = None
    source: str


class VersionListResponse(BaseModel):
    items: list[VersionListItem]
    next_cursor: str | None = None
    has_more: bool


class VersionDetailResponse(BaseModel):
    version_number: int
    created_at: datetime
    created_by: UserBrief | None = None
    label: str | None = None
    source: str
    content: str


class VersionDiffResponse(BaseModel):
    base_version: int
    compare_version: int
    base_content: str
    compare_content: str


class CreateCheckpointRequest(BaseModel):
    label: str = Field(min_length=1, max_length=200)


class CreateCheckpointResponse(BaseModel):
    version_number: int
    created_at: datetime
    created_by: UserBrief | None = None
    label: str
    source: str


class RestoreResponse(BaseModel):
    restored_to_version: int
    pre_restore_version: int
    post_restore_version: int
    content: str
