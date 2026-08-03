from datetime import datetime

from pydantic import BaseModel, Field

# BIGINT column bound (users.id is BigInteger).
_BIGINT_MAX = 9223372036854775807


# --- Sub-models ---

class ShareUser(BaseModel):
    id: int
    username: str
    display_name: str
    email: str
    avatar_url: str | None = None


class PublicLinkResponse(BaseModel):
    token: str
    permission: str
    is_active: bool
    url: str
    created_at: datetime


# --- Request schemas ---

class CreateShareRequest(BaseModel):
    user_id: int = Field(ge=1, le=_BIGINT_MAX)
    permission: str = Field(pattern="^(editor|viewer)$")


class UpdateShareRequest(BaseModel):
    permission: str = Field(pattern="^(editor|viewer)$")


class CreatePublicLinkRequest(BaseModel):
    pass


# --- Response schemas ---

class ShareResponse(BaseModel):
    id: int
    user: ShareUser
    permission: str
    created_at: datetime


class ShareListResponse(BaseModel):
    owner: ShareUser
    shares: list[ShareResponse]
    public_link: PublicLinkResponse | None = None
