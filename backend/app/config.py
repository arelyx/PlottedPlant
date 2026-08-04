from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Application
    app_env: str = "production"
    log_level: str = "info"

    # Database
    database_url: str

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # PlantUML
    plantuml_server_url: str = "http://plantuml:8080"

    # Collaboration
    collaboration_server_url: str = "http://collaboration:1235"

    # Security
    internal_secret: str

    # Clerk (identity & credentials). The secret key authorizes Clerk Backend
    # API calls (user provisioning); the issuer/JWKS verify session tokens.
    clerk_secret_key: str = ""
    clerk_issuer: str = "https://clerk.plottedplant.com"
    clerk_jwks_url: str = "https://clerk.plottedplant.com/.well-known/jwks.json"
    clerk_api_url: str = "https://api.clerk.com/v1"
    # Comma-separated origins Clerk may mint tokens for (checked via `azp`).
    clerk_authorized_parties: str = "https://plottedplant.com"

    # Interval between background maintenance sweeps (orphaned-content GC).
    maintenance_interval_seconds: int = 21600  # 6 hours

    # Delta-chain snapshot interval (K): force a full zstd snapshot when a
    # forward-delta chain would otherwise reach this depth, bounding
    # reconstruction cost to at most K decompressions per version.
    version_snapshot_interval: int = 32

    # DB connection pool (per uvicorn worker; there are 4 — see backend/Dockerfile).
    # Keep 4 * (db_pool_size + db_max_overflow) comfortably under Postgres
    # `max_connections` (100, see postgres/postgresql.conf), leaving headroom for
    # the maintenance loop and collaboration's internal calls: 4 * (8 + 8) = 64/100.
    # db_pool_timeout must stay BELOW nginx's `proxy_read_timeout` (30s, see
    # nginx/nginx.conf) so the backend's structured 503 reaches the client before
    # nginx gives up and returns a bare 504. Do not raise this past ~25s without
    # also raising the nginx timeout.
    db_pool_size: int = 8
    db_max_overflow: int = 8
    db_pool_timeout: int = 20
    db_pool_recycle: int = 1800

    # Public
    public_url: str = "http://localhost"
    cors_origins: str = "http://localhost"

    model_config = {"env_file": ".env"}


settings = Settings()
