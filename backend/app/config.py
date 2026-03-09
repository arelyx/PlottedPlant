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
    jwt_secret_key: str
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 30

    # OAuth
    oauth_google_client_id: str = ""
    oauth_google_client_secret: str = ""
    oauth_github_client_id: str = ""
    oauth_github_client_secret: str = ""
    oauth_redirect_base_url: str = ""

    # Email (Resend)
    resend_api_key: str = ""
    email_from: str = "PlottedPlant <noreply@plottedplant.com>"

    # Public
    public_url: str = "http://localhost"
    cors_origins: str = "http://localhost"

    model_config = {"env_file": ".env"}


settings = Settings()
