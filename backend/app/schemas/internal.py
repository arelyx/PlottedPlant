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
