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

    # Public
    public_url: str = "http://localhost"
    cors_origins: str = "http://localhost"

    model_config = {"env_file": ".env"}


settings = Settings()
