import re
from datetime import datetime

from pydantic import BaseModel, field_validator


class UserUpdateRequest(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Display name cannot be empty")
            if len(v) > 100:
                raise ValueError("Display name must be at most 100 characters")
        return v


class UserSearchResponse(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_url: str | None

    model_config = {"from_attributes": True}


class PreferencesResponse(BaseModel):
    theme: str
    editor_font_size: int
    editor_minimap: bool
    editor_word_wrap: bool

    model_config = {"from_attributes": True}


class PreferencesUpdateRequest(BaseModel):
    theme: str | None = None
    editor_font_size: int | None = None
    editor_minimap: bool | None = None
    editor_word_wrap: bool | None = None

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, v: str | None) -> str | None:
        if v is not None and v not in ("light", "dark", "system"):
            raise ValueError("Theme must be 'light', 'dark', or 'system'")
        return v

    @field_validator("editor_font_size")
    @classmethod
    def validate_font_size(cls, v: int | None) -> int | None:
        if v is not None and not (8 <= v <= 32):
            raise ValueError("Font size must be between 8 and 32")
        return v
