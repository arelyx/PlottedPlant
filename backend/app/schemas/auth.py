import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


class RegisterRequest(BaseModel):
    email: str
    username: str
    display_name: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^[^@]+@[^@]+\.[^@]+$", v):
            raise ValueError("Invalid email format")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_-]{3,30}$", v):
            raise ValueError(
                "Username must be 3-30 characters, alphanumeric with hyphens and underscores"
            )
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Display name cannot be empty")
        if len(v) > 100:
            raise ValueError("Display name must be at most 100 characters")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class PasswordForgotRequest(BaseModel):
    email: str


class PasswordResetRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class EmailVerifyRequest(BaseModel):
    token: str


class AuthResponse(BaseModel):
    user: "UserResponse"
    access_token: str
    expires_in: int


class TokenResponse(BaseModel):
    access_token: str
    expires_in: int


class MessageResponse(BaseModel):
    message: str


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    display_name: str
    avatar_url: str | None
    is_email_verified: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
