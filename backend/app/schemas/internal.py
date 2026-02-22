from pydantic import BaseModel, Field


class AuthValidateRequest(BaseModel):
    token: str
    document_id: int


class AuthValidateResponse(BaseModel):
    valid: bool
    user_id: int | None = None
    display_name: str | None = None
    permission: str | None = None
    reason: str | None = None


class SyncRequest(BaseModel):
    content: str = Field(max_length=500_000)
    edited_by_user_id: int | None = None


class SyncResponse(BaseModel):
    version_created: bool
    version_number: int | None = None


class SessionEndResponse(BaseModel):
    version_created: bool
    version_number: int | None = None
    source: str | None = None
