from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Import all models so Alembic can detect them via Base.metadata
from app.models.user import User  # noqa: E402, F401
from app.models.oauth_account import OAuthAccount  # noqa: E402, F401
from app.models.refresh_token import RefreshToken  # noqa: E402, F401
from app.models.password_reset_token import PasswordResetToken  # noqa: E402, F401
from app.models.user_preferences import UserPreferences  # noqa: E402, F401
from app.models.folder import Folder  # noqa: E402, F401
from app.models.document import Document  # noqa: E402, F401
from app.models.document_content import DocumentContent  # noqa: E402, F401
from app.models.document_version import DocumentVersion  # noqa: E402, F401
from app.models.template import Template  # noqa: E402, F401
from app.models.document_share import DocumentShare  # noqa: E402, F401
from app.models.folder_share import FolderShare  # noqa: E402, F401
from app.models.public_share_link import PublicShareLink  # noqa: E402, F401
