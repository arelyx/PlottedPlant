#!/bin/bash
# scripts/restore.sh — Restore PostgreSQL from a backup file
# Usage:
#   source .env && ./scripts/restore.sh ./backups/plantuml_20260101_120000.sql.zst
#   source .env && ./scripts/restore.sh ./backups/plantuml_20260101_120000.sql.zst.enc

set -euo pipefail

# ─── Validate arguments ───
if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file>"
  echo ""
  echo "Examples:"
  echo "  source .env && $0 ./backups/plantuml_20260101_120000.sql.zst"
  echo "  source .env && $0 ./backups/plantuml_20260101_120000.sql.zst.enc"
  exit 1
fi

# ─── Validate required variables ───
if [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_DB:-}" ]; then
  echo "Error: POSTGRES_USER and POSTGRES_DB must be set."
  echo "Run: source .env && $0 <backup-file>"
  exit 1
fi

# ─── Validate required tools ───
for cmd in docker zstd; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' is not installed or not in PATH."
    exit 1
  fi
done

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "[$(date)] Restoring from: ${BACKUP_FILE}"
echo "  File size: $(du -h "${BACKUP_FILE}" | cut -f1)"

# Decrypt if encrypted
RESTORE_FILE="${BACKUP_FILE}"
TEMP_DECRYPTED=""
if [[ "${BACKUP_FILE}" == *.enc ]]; then
  if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo "Error: BACKUP_ENCRYPTION_KEY is required to decrypt .enc files"
    exit 1
  fi
  if ! command -v openssl &>/dev/null; then
    echo "Error: 'openssl' is not installed."
    exit 1
  fi
  TEMP_DECRYPTED="${BACKUP_FILE%.enc}"
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "${BACKUP_FILE}" \
    -out "${TEMP_DECRYPTED}" \
    -pass file:<(echo -n "${BACKUP_ENCRYPTION_KEY}")
  RESTORE_FILE="${TEMP_DECRYPTED}"
  echo "[$(date)] Decrypted backup"
fi

# Confirm before proceeding
echo ""
echo "WARNING: This will replace all data in the '${POSTGRES_DB}' database"
echo "with the contents of the backup. Existing data will be overwritten."
echo ""
read -p "Continue? (yes/no): " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "Restore cancelled."
  [ -n "${TEMP_DECRYPTED}" ] && rm -f "${TEMP_DECRYPTED}"
  exit 0
fi

echo "[$(date)] Stopping application services..."
docker compose stop backend collaboration

echo "[$(date)] Restoring database..."
zstd -d --stdout "${RESTORE_FILE}" | docker compose exec -T postgres psql \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --single-transaction \
  --set ON_ERROR_STOP=on \
  -q

RESTORE_EXIT=$?

# Clean up temp file
[ -n "${TEMP_DECRYPTED}" ] && rm -f "${TEMP_DECRYPTED}"

if [ $RESTORE_EXIT -ne 0 ]; then
  echo "[$(date)] Error: Database restore failed (exit code: $RESTORE_EXIT)."
  echo "The database may be in an inconsistent state. Check the output above."
  echo "Restarting services..."
  docker compose up -d backend collaboration
  exit 1
fi

echo "[$(date)] Database restore successful."

echo "[$(date)] Running migrations to ensure schema is up to date..."
docker compose run --rm backend alembic upgrade head

echo "[$(date)] Restarting services..."
docker compose up -d backend collaboration

# Wait for services to be healthy
echo "[$(date)] Waiting for services to become healthy..."
HEALTHY=false
for i in $(seq 1 30); do
  BACKEND_STATUS=$(docker inspect --format='{{.State.Health.Status}}' plantuml-backend 2>/dev/null || echo "unknown")
  if [ "$BACKEND_STATUS" = "healthy" ]; then
    HEALTHY=true
    break
  fi
  sleep 2
done

if [ "$HEALTHY" = true ]; then
  echo "[$(date)] Restore complete. All services healthy."
else
  echo "[$(date)] Warning: Backend not yet healthy after 60s. Check: docker compose ps"
fi

# Quick verification
echo ""
echo "=== Post-restore verification ==="
docker compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -q -c \
  "SELECT 'users' as table_name, count(*) as row_count FROM users
   UNION ALL SELECT 'documents', count(*) FROM documents
   UNION ALL SELECT 'document_versions', count(*) FROM document_versions
   UNION ALL SELECT 'folders', count(*) FROM folders
   ORDER BY table_name;"
