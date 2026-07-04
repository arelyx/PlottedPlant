import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Bind tokens to this app so a shared jwt_secret_key can't mint/accept tokens
# interchangeable with another service.
JWT_ISSUER = "plottedplant"
JWT_AUDIENCE = "plottedplant-api"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# A fixed bcrypt hash used to equalize login timing. Verifying a supplied
# password against this hash costs the same as a real check, so a missing or
# passwordless (OAuth-only) account can't be distinguished by response time.
_DUMMY_PASSWORD_HASH = pwd_context.hash("timing-equalizer")


def dummy_verify_password(plain_password: str) -> None:
    """Run a throwaway bcrypt verification to match the timing of a real one."""
    pwd_context.verify(plain_password, _DUMMY_PASSWORD_HASH)


def hash_token(token: str) -> bytes:
    """SHA-256 hash a token for database storage. Raw token goes to client."""
    return hashlib.sha256(token.encode("utf-8")).digest()


def generate_token() -> str:
    """Generate a cryptographically secure random token."""
    return secrets.token_urlsafe(48)


def create_access_token(user_id: int) -> tuple[str, int]:
    """Create a JWT access token. Returns (token, expires_in_seconds)."""
    expires_in = settings.jwt_access_token_expire_minutes * 60
    expire = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")
    return token, expires_in


def decode_access_token(token: str) -> dict | None:
    """Decode and validate a JWT access token. Returns payload or None."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=["HS256"],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
        )
        if payload.get("type") != "access":
            return None
        return payload
    except jwt.PyJWTError:
        return None
