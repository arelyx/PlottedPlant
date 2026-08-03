"""change documents.folder_id FK to ON DELETE CASCADE

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-03

Resolves the folder-delete delete-vs-orphan divergence: the DB FK
`documents_folder_id_fkey` was `ON DELETE SET NULL` while the ORM relationship
`Folder.documents` is `cascade="all, delete-orphan"`. The API delete path (ORM)
already deletes a folder's documents, so we make the DB agree by switching the
FK to `ON DELETE CASCADE`. After this, deleting a folder deletes its documents
(and their versions, via the existing document_versions CASCADE) through BOTH
the ORM path and any raw SQL / FK-driven delete.

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("documents_folder_id_fkey", "documents", type_="foreignkey")
    op.create_foreign_key(
        "documents_folder_id_fkey",
        "documents",
        "folders",
        ["folder_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("documents_folder_id_fkey", "documents", type_="foreignkey")
    op.create_foreign_key(
        "documents_folder_id_fkey",
        "documents",
        "folders",
        ["folder_id"],
        ["id"],
        ondelete="SET NULL",
    )
