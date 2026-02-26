import logging
import secrets

from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db
from app.models.oauth_account import OAuthAccount
from app.models.user import User
from app.services.auth import create_refresh_token
from app.utils.security import create_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth/oauth", tags=["oauth"])

REFRESH_COOKIE_NAME = "refresh_token"

# Provider configuration
PROVIDERS = {
    "github": {
        "client_id_setting": "oauth_github_client_id",
        "client_secret_setting": "oauth_github_client_secret",
        "authorize_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "userinfo_url": "https://api.github.com/user",
        "emails_url": "https://api.github.com/user/emails",
        "scope": "read:user user:email",
    },
    "google": {
        "client_id_setting": "oauth_google_client_id",
        "client_secret_setting": "oauth_google_client_secret",
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://www.googleapis.com/oauth2/v3/userinfo",
        "emails_url": None,
        "scope": "openid email profile",
    },
}


def _get_provider_config(provider: str) -> dict:
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown OAuth provider.")
    config = PROVIDERS[provider]
    client_id = getattr(settings, config["client_id_setting"])
    client_secret = getattr(settings, config["client_secret_setting"])
    if not client_id or not client_secret:
        raise HTTPException(status_code=404, detail="OAuth provider not configured.")
    return {**config, "client_id": client_id, "client_secret": client_secret}


def _set_refresh_cookie(response: Response, token: str) -> None:
    secure = settings.app_env != "development"
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax",  # lax required for OAuth redirects
        path="/api/v1/auth",
        max_age=settings.jwt_refresh_token_expire_days * 86400,
    )


@router.get("/{provider}/authorize")
async def oauth_authorize(provider: str, request: Request):
    """Redirect user to OAuth provider's authorization page."""
    config = _get_provider_config(provider)
    redirect_uri = f"{settings.public_url}/api/v1/auth/oauth/{provider}/callback"

    client = AsyncOAuth2Client(
        client_id=config["client_id"],
        client_secret=config["client_secret"],
        redirect_uri=redirect_uri,
        scope=config["scope"],
    )

    state = secrets.token_urlsafe(32)
    # Store state in a short-lived cookie for CSRF validation
    authorization_url, _ = client.create_authorization_url(
        config["authorize_url"], state=state
    )

    response = Response(status_code=307, headers={"Location": authorization_url})
    response.set_cookie(
        key=f"oauth_state_{provider}",
        value=state,
        httponly=True,
        secure=settings.app_env != "development",
        samesite="lax",
        max_age=600,  # 10 minutes
        path="/api/v1/auth/oauth",
    )
    return response


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle OAuth provider callback, create/link user, redirect to frontend."""
    if error:
        logger.warning("OAuth %s error: %s", provider, error)
        return Response(
            status_code=307,
            headers={"Location": f"{settings.public_url}/login?error=oauth_denied"},
        )

    if not code or not state:
        return Response(
            status_code=307,
            headers={"Location": f"{settings.public_url}/login?error=oauth_failed"},
        )

    # Validate CSRF state
    stored_state = request.cookies.get(f"oauth_state_{provider}")
    if not stored_state or stored_state != state:
        logger.warning("OAuth %s state mismatch", provider)
        return Response(
            status_code=307,
            headers={"Location": f"{settings.public_url}/login?error=oauth_failed"},
        )

    config = _get_provider_config(provider)
    redirect_uri = f"{settings.public_url}/api/v1/auth/oauth/{provider}/callback"

    # Exchange code for token
    client = AsyncOAuth2Client(
        client_id=config["client_id"],
        client_secret=config["client_secret"],
        redirect_uri=redirect_uri,
    )

    try:
        token_data = await client.fetch_token(
            config["token_url"],
            code=code,
            grant_type="authorization_code",
        )
    except Exception:
        logger.exception("OAuth %s token exchange failed", provider)
        return Response(
            status_code=307,
            headers={"Location": f"{settings.public_url}/login?error=oauth_failed"},
        )

    # Fetch user profile from provider
    provider_user = await _fetch_provider_user(client, config, provider)
    if provider_user is None:
        return Response(
            status_code=307,
            headers={"Location": f"{settings.public_url}/login?error=oauth_failed"},
        )

    provider_user_id = str(provider_user["id"])
    provider_email = provider_user.get("email")
    provider_name = provider_user.get("name") or provider_user.get("login") or ""
    provider_username = provider_user.get("login")  # GitHub only
    provider_avatar = provider_user.get("avatar_url") or provider_user.get("picture")

    # Check if OAuth account already exists
    result = await db.execute(
        select(OAuthAccount)
        .where(OAuthAccount.provider == provider)
        .where(OAuthAccount.provider_user_id == provider_user_id)
    )
    oauth_account = result.scalar_one_or_none()

    if oauth_account is not None:
        # Existing OAuth link — log in
        user_result = await db.execute(
            select(User).where(User.id == oauth_account.user_id)
        )
        user = user_result.scalar_one()

        # Update stored tokens
        oauth_account.access_token = token_data.get("access_token")
        oauth_account.refresh_token = token_data.get("refresh_token")
        oauth_account.provider_email = provider_email
        if provider_avatar and not user.avatar_url:
            user.avatar_url = provider_avatar
    else:
        # New OAuth account — find existing user by email or create new
        user = None
        if provider_email:
            from sqlalchemy import func
            result = await db.execute(
                select(User).where(func.lower(User.email) == provider_email.lower())
            )
            user = result.scalar_one_or_none()

        if user is None:
            # Create new user
            username = await _generate_unique_username(db, provider_username, provider_name)
            display_name = provider_name or username

            user = User(
                email=provider_email or f"{provider}_{provider_user_id}@oauth.local",
                username=username,
                display_name=display_name,
                password_hash=None,  # OAuth-only account
                is_email_verified=provider_email is not None,
                avatar_url=provider_avatar,
            )
            db.add(user)
            await db.flush()

        # Link OAuth account
        oauth_link = OAuthAccount(
            user_id=user.id,
            provider=provider,
            provider_user_id=provider_user_id,
            provider_email=provider_email,
            access_token=token_data.get("access_token"),
            refresh_token=token_data.get("refresh_token"),
        )
        db.add(oauth_link)

    # Issue our own tokens
    raw_refresh = await create_refresh_token(db, user.id)
    await db.commit()

    # Redirect to frontend callback page with refresh cookie set
    response = Response(
        status_code=307,
        headers={"Location": f"{settings.public_url}/oauth/callback"},
    )
    _set_refresh_cookie(response, raw_refresh)
    # Clear the state cookie
    response.delete_cookie(
        key=f"oauth_state_{provider}",
        path="/api/v1/auth/oauth",
    )
    return response


async def _fetch_provider_user(
    client: AsyncOAuth2Client, config: dict, provider: str
) -> dict | None:
    """Fetch user profile from OAuth provider."""
    try:
        resp = await client.get(config["userinfo_url"])
        if resp.status_code != 200:
            logger.error("OAuth %s userinfo failed: %s", provider, resp.status_code)
            return None
        user_data = resp.json()

        # GitHub doesn't always include email in profile — fetch from emails endpoint
        if provider == "github" and not user_data.get("email") and config["emails_url"]:
            emails_resp = await client.get(config["emails_url"])
            if emails_resp.status_code == 200:
                emails = emails_resp.json()
                primary = next(
                    (e for e in emails if e.get("primary") and e.get("verified")),
                    None,
                )
                if primary:
                    user_data["email"] = primary["email"]

        return user_data
    except Exception:
        logger.exception("OAuth %s user fetch failed", provider)
        return None


async def _generate_unique_username(
    db: AsyncSession, provider_username: str | None, display_name: str
) -> str:
    """Generate a unique username from provider data."""
    import re
    from sqlalchemy import func

    # Try provider username first (GitHub login)
    candidates = []
    if provider_username:
        clean = re.sub(r"[^a-zA-Z0-9_-]", "", provider_username)[:30]
        if len(clean) >= 3:
            candidates.append(clean)

    # Fall back to display name
    if not candidates and display_name:
        clean = re.sub(r"[^a-zA-Z0-9_-]", "", display_name.replace(" ", "_"))[:30]
        if len(clean) >= 3:
            candidates.append(clean)

    # Last resort
    if not candidates:
        candidates.append("user")

    for base in candidates:
        # Try the base name first
        result = await db.execute(
            select(User).where(func.lower(User.username) == base.lower())
        )
        if result.scalar_one_or_none() is None:
            return base

        # Append random suffix
        for _ in range(10):
            suffixed = f"{base[:26]}_{secrets.token_hex(2)}"
            result = await db.execute(
                select(User).where(func.lower(User.username) == suffixed.lower())
            )
            if result.scalar_one_or_none() is None:
                return suffixed

    # Fallback to fully random
    return f"user_{secrets.token_hex(4)}"
