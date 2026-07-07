from datetime import datetime

from pydantic import BaseModel


class UserResponse(BaseModel):
    """The local app profile for the authenticated user (identity is Clerk's)."""

    id: int
    email: str
    username: str
    display_name: str
    avatar_url: str | None
    is_email_verified: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
