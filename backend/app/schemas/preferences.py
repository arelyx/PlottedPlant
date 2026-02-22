from pydantic import BaseModel, Field


class PreferencesResponse(BaseModel):
    theme: str
    editor_font_size: int
    editor_minimap: bool
    editor_word_wrap: bool


class PreferencesUpdateRequest(BaseModel):
    theme: str = Field(pattern=r"^(light|dark|system)$")
    editor_font_size: int = Field(ge=8, le=32)
    editor_minimap: bool
    editor_word_wrap: bool
