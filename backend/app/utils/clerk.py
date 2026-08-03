"""Clerk session-token verification and just-in-time user provisioning.

Identity and credentials live in Clerk. This module verifies Clerk session
JWTs (RS256, via the instance JWKS) and maps a Clerk subject to a local
``users`` row, creating one on first sight.
"""

import logging
import re
import secrets

import httpx
import jwt
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)

# PyJWKClient caches signing keys in-memory after the first fetch, so steady
# state verification is networkless.
_jwks_client = PyJWKClient(settings.clerk_jwks_url)

_AUTHORIZED_PARTIES = [
    p.strip() for p in settings.clerk_authorized_parties.split(",") if p.strip()
]


def verify_clerk_token(token: str) -> dict | None:
    """Verify a Clerk session JWT. Returns its claims, or None if invalid.

    Synchronous (PyJWKClient is blocking); call via ``asyncio.to_thread`` from
    async code to avoid stalling the event loop on a JWKS cache miss.
    """
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            leeway=5,
            options={"verify_aud": False, "require": ["exp", "iat", "sub"]},
        )
    except Exception:
        return None

    # Defense-in-depth: Clerk stamps `azp` with the requesting origin. If we've
    # configured allowed origins, reject tokens minted for anything else.
    if _AUTHORIZED_PARTIES:
        azp = claims.get("azp")
        if azp and azp not in _AUTHORIZED_PARTIES:
            return None

    return claims


async def _fetch_clerk_user(clerk_user_id: str) -> dict:
    """Fetch a user's profile from the Clerk Backend API."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{settings.clerk_api_url}/users/{clerk_user_id}",
            headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
        )
        resp.raise_for_status()
        return resp.json()


def _primary_email(profile: dict) -> str | None:
    primary_id = profile.get("primary_email_address_id")
    emails = profile.get("email_addresses") or []
    for e in emails:
        if e.get("id") == primary_id:
            return e.get("email_address")
    return emails[0].get("email_address") if emails else None


def _derive_display_name(profile: dict, email: str | None) -> str:
    name = f"{profile.get('first_name') or ''} {profile.get('last_name') or ''}".strip()
    if name:
        return name[:100]
    if profile.get("username"):
        return str(profile["username"])[:100]
    if email:
        return email.split("@")[0][:100]
    return "User"


def _base_username(profile: dict, email: str | None) -> str:
    """A username seed satisfying the users.username check (^[A-Za-z0-9_-]{3,30}$)."""
    raw = profile.get("username") or (email.split("@")[0] if email else "user")
    raw = re.sub(r"[^a-zA-Z0-9_]", "", raw).lower()
    if len(raw) < 3:
        raw = raw + "user"
    # Cap short enough to leave room for a uniqueness suffix.
    return raw[:25]


_USERNAME_SUFFIX_LEN = 6  # hex chars -> 24 bits of entropy, plenty to avoid collisions


def _random_username(base: str) -> str:
    """Append a short random suffix to ``base`` so the candidate needs no
    pre-insert collision check: collisions are astronomically unlikely, and
    the DB's unique constraint is the final arbiter (see get_or_provision_user).
    """
    # Trim base to leave room for "-" + suffix while staying <= 30 chars.
    trimmed = base[: 30 - 1 - _USERNAME_SUFFIX_LEN]
    return f"{trimmed}-{secrets.token_hex(_USERNAME_SUFFIX_LEN // 2)}"


async def get_or_provision_user(db: AsyncSession, claims: dict) -> User:
    """Return the local user for a Clerk subject, creating one on first sight."""
    clerk_user_id = claims["sub"]

    existing = (
        await db.execute(select(User).where(User.clerk_user_id == clerk_user_id))
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    profile = await _fetch_clerk_user(clerk_user_id)
    email = _primary_email(profile) or f"{clerk_user_id}@users.noreply.clerk"
    display_name = _derive_display_name(profile, email)
    avatar_url = profile.get("image_url")
    base = _base_username(profile, email)

    for attempt in range(5):
        username = _random_username(base)
        try:
            await db.execute(
                pg_insert(User)
                .values(
                    clerk_user_id=clerk_user_id,
                    email=email,
                    username=username,
                    display_name=display_name,
                    avatar_url=avatar_url,
                    is_email_verified=True,
                )
                # A concurrent request provisioning the same Clerk user is a
                # no-op; the re-select below picks up whichever request won.
                .on_conflict_do_nothing(index_elements=["clerk_user_id"])
            )
            await db.commit()
            break
        except IntegrityError:
            # Either a sibling request beat us to this same clerk_user_id
            # (only possible via the email/username constraints below, since
            # the clerk_user_id conflict itself is absorbed by DO NOTHING
            # above), or our random username/email collided with an unrelated
            # row. Roll back and re-select by clerk_user_id first: if it now
            # exists, a concurrent request already provisioned it and we're
            # done. Otherwise this was a username collision — retry with a
            # fresh random suffix.
            await db.rollback()
            winner = (
                await db.execute(select(User).where(User.clerk_user_id == clerk_user_id))
            ).scalar_one_or_none()
            if winner is not None:
                return winner
            if attempt == 4:
                raise

    user = (
        await db.execute(select(User).where(User.clerk_user_id == clerk_user_id))
    ).scalar_one()
    logger.info("Provisioned local user %s for Clerk %s", user.id, clerk_user_id)
    return user
