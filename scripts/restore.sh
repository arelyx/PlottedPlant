#!/bin/bash
# scripts/restore.sh — Restore PostgreSQL from a backup file
# Usage:
#   ./scripts/restore.sh /backups/plantuml_20260101_120000.sql.zst
#   ./scripts/restore.sh /backups/plantuml_20260101_120000.sql.zst.enc

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file>"
  echo ""
  echo "Examples:"
  echo "  $0 /backups/plantuml_20260101_120000.sql.zst"
  echo "  $0 /backups/plantuml_20260101_120000.sql.zst.enc"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "[$(date)] Restoring from: ${BACKUP_FILE}"

# Decrypt if encrypted
RESTORE_FILE="${BACKUP_FILE}"
TEMP_DECRYPTED=""
if [[ "${BACKUP_FILE}" == *.enc ]]; then
  if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo "Error: BACKUP_ENCRYPTION_KEY is required to decrypt .enc files"
    exit 1
  fi
  TEMP_DECRYPTED="${BACKUP_FILE%.enc}"
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "${BACKUP_FILE}" \
    -out "${TEMP_DECRYPTED}" \
    -pass "pass:${BACKUP_ENCRYPTION_KEY}"
  RESTORE_FILE="${TEMP_DECRYPTED}"
  echo "[$(date)] Decrypted backup"
fi

# Confirm before proceeding
echo ""
echo "WARNING: This will DROP and recreate the database."
echo "All current data will be replaced with the backup contents."
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
  --set ON_ERROR_STOP=on

# Clean up temp file
[ -n "${TEMP_DECRYPTED}" ] && rm -f "${TEMP_DECRYPTED}"

echo "[$(date)] Running migrations to ensure schema is up to date..."
docker compose run --rm backend alembic upgrade head

echo "[$(date)] Restarting services..."
docker compose up -d backend collaboration

echo "[$(date)] Restore complete. Verify with: docker compose ps"
