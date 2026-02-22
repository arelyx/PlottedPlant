"""Application-level rate limiting using Redis sliding window."""

import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.dependencies import redis_client


# Rate limit configurations: (max_requests, window_seconds)
RATE_LIMITS: dict[str, tuple[int, int]] = {
    # Auth endpoints — per IP
    "POST:/api/v1/auth/login": (10, 900),           # 10 per 15 min
    "POST:/api/v1/auth/register": (5, 3600),         # 5 per hour
    "POST:/api/v1/auth/password/forgot": (3, 3600),   # 3 per hour
    # Render — per user
    "POST:/api/v1/render/svg": (60, 60),              # 60 per min
    "POST:/api/v1/render/check": (60, 60),            # 60 per min
}

# Default rate limit for authenticated endpoints
DEFAULT_AUTH_LIMIT = (120, 60)  # 120 per min
# Export rate limit
EXPORT_PREFIX = "/api/v1/documents/"
EXPORT_SUFFIX = "/export/"
EXPORT_LIMIT = (30, 60)  # 30 per min


def _get_rate_limit(method: str, path: str) -> tuple[int, int] | None:
    """Get the rate limit for a given method+path. Returns None if no limit applies."""
    key = f"{method}:{path}"
    if key in RATE_LIMITS:
        return RATE_LIMITS[key]

    # Export endpoints
    if method == "POST" and EXPORT_PREFIX in path and EXPORT_SUFFIX in path:
        return EXPORT_LIMIT

    # Skip internal and health endpoints
    if "/api/v1/internal/" in path or path == "/api/v1/health":
        return None

    # Default limit for all other authenticated API endpoints
    if path.startswith("/api/v1/"):
        return DEFAULT_AUTH_LIMIT

    return None


def _get_client_key(request: Request, method: str, path: str) -> str:
    """Build a Redis key based on user ID (if authenticated) or IP address."""
    # Auth endpoints use IP-based limiting (no token yet)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer ") and "auth/" not in path:
        # Use a simplified user identifier from the token
        # We don't decode the full JWT here for performance — use a hash of the token
        token_prefix = auth_header[7:27]  # First 20 chars of token
        return f"rl:{method}:{path}:u:{token_prefix}"

    # IP-based for unauthenticated or auth endpoints
    client_ip = request.headers.get("X-Real-IP") or request.client.host if request.client else "unknown"
    return f"rl:{method}:{path}:ip:{client_ip}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        method = request.method
        path = request.url.path

        limit = _get_rate_limit(method, path)
        if limit is None:
            return await call_next(request)

        max_requests, window = limit
        redis_key = _get_client_key(request, method, path)

        try:
            pipe = redis_client.pipeline()
            now = time.time()
            window_start = now - window

            # Sliding window: remove old entries, add current, count
            pipe.zremrangebyscore(redis_key, 0, window_start)
            pipe.zadd(redis_key, {str(now): now})
            pipe.zcard(redis_key)
            pipe.expire(redis_key, window + 1)
            results = await pipe.execute()
            current_count = results[2]
        except Exception:
            # If Redis is down, allow the request (fail open)
            return await call_next(request)

        if current_count > max_requests:
            retry_after = int(window - (now - window_start))
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."},
                headers={"Retry-After": str(max(1, retry_after))},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(max(0, max_requests - current_count))
        return response
