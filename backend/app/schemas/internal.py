from pydantic import BaseModel, Field

from app.schemas.validators import NoNulStr

# BIGINT column bound (users.id is BigInteger).
_BIGINT_MAX = 9223372036854775807


class AuthValidateRequest(BaseModel):
    token: str
    document_id: str


class AuthValidateResponse(BaseModel):
    valid: bool
    user_id: int | None = None
    display_name: str | None = None
    permission: str | None = None
    reason: str | None = None


class SyncRequest(BaseModel):
    content: NoNulStr = Field(max_length=500_000)
    edited_by_user_id: int | None = Field(default=None, ge=1, le=_BIGINT_MAX)


class SyncResponse(BaseModel):
    version_created: bool
    version_number: int | None = None


class SessionEndResponse(BaseModel):
    version_created: bool
    version_number: int | None = None
    source: str | None = None
