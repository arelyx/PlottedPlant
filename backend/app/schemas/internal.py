from pydantic import BaseModel


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
    content: str
    edited_by_user_id: int


class SyncResponse(BaseModel):
    version_created: bool
    version_number: int | None = None


class SessionEndResponse(BaseModel):
    version_created: bool
    version_number: int | None = None
    source: str | None = None
