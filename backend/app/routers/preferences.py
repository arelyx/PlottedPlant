from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user_id, get_db
from app.models.user_preferences import UserPreferences
from app.schemas.preferences import PreferencesResponse, PreferencesUpdateRequest

router = APIRouter(prefix="/api/v1/users/me", tags=["preferences"])

# Default values when no preferences row exists
_DEFAULTS = PreferencesResponse(
    theme="system",
    editor_font_size=14,
    editor_minimap=False,
    editor_word_wrap=True,
)


@router.get("/preferences", response_model=PreferencesResponse)
async def get_preferences(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's editor preferences. Returns defaults if not set."""
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    prefs = result.scalar_one_or_none()

    if prefs is None:
        return _DEFAULTS

    return PreferencesResponse(
        theme=prefs.theme,
        editor_font_size=prefs.editor_font_size,
        editor_minimap=prefs.editor_minimap,
        editor_word_wrap=prefs.editor_word_wrap,
    )


@router.put("/preferences", response_model=PreferencesResponse)
async def update_preferences(
    body: PreferencesUpdateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's editor preferences. Creates row if not exists."""
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    prefs = result.scalar_one_or_none()

    if prefs is None:
        prefs = UserPreferences(
            user_id=user_id,
            theme=body.theme,
            editor_font_size=body.editor_font_size,
            editor_minimap=body.editor_minimap,
            editor_word_wrap=body.editor_word_wrap,
        )
        db.add(prefs)
    else:
        prefs.theme = body.theme
        prefs.editor_font_size = body.editor_font_size
        prefs.editor_minimap = body.editor_minimap
        prefs.editor_word_wrap = body.editor_word_wrap

    await db.commit()
    await db.refresh(prefs)

    return PreferencesResponse(
        theme=prefs.theme,
        editor_font_size=prefs.editor_font_size,
        editor_minimap=prefs.editor_minimap,
        editor_word_wrap=prefs.editor_word_wrap,
    )
