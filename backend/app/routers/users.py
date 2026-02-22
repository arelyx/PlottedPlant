from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.models.user_preferences import UserPreferences
from app.schemas.auth import UserResponse
from app.schemas.user import (
    PreferencesResponse,
    PreferencesUpdateRequest,
    UserSearchResponse,
    UserUpdateRequest,
)

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("/me")
async def get_me(user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(user)


@router.patch("/me")
async def update_me(
    body: UserUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url

    await db.commit()
    await db.refresh(user)

    return UserResponse.model_validate(user)


@router.get("/search")
async def search_users(
    q: str = Query(..., min_length=2, max_length=50),
    limit: int = Query(10, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[UserSearchResponse]:
    """Search users by username or email prefix for the sharing dialog."""
    from sqlalchemy import or_

    pattern = f"{q.lower()}%"
    result = await db.execute(
        select(User)
        .where(
            User.id != user.id,
            or_(
                func.lower(User.username).like(pattern),
                func.lower(User.email).like(pattern),
            ),
        )
        .order_by(User.username)
        .limit(limit)
    )
    users = result.scalars().all()
    return [UserSearchResponse.model_validate(u) for u in users]


@router.get("/me/preferences")
async def get_preferences(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PreferencesResponse:
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()

    if prefs is None:
        # Return defaults without creating a row (lazy creation)
        return PreferencesResponse(
            theme="system",
            editor_font_size=14,
            editor_minimap=False,
            editor_word_wrap=True,
        )

    return PreferencesResponse.model_validate(prefs)


@router.put("/me/preferences")
async def update_preferences(
    body: PreferencesUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PreferencesResponse:
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()

    if prefs is None:
        # Create on first update (lazy creation)
        prefs = UserPreferences(user_id=user.id)
        db.add(prefs)

    if body.theme is not None:
        prefs.theme = body.theme
    if body.editor_font_size is not None:
        prefs.editor_font_size = body.editor_font_size
    if body.editor_minimap is not None:
        prefs.editor_minimap = body.editor_minimap
    if body.editor_word_wrap is not None:
        prefs.editor_word_wrap = body.editor_word_wrap

    await db.commit()
    await db.refresh(prefs)

    return PreferencesResponse.model_validate(prefs)
