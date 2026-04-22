#!/bin/bash
# scripts/backup.sh — Automated PostgreSQL backup with optional encryption and S3 upload
# Run via cron every 6 hours:
#   0 */6 * * * cd /home/arelyx/PlottedPlant && source .env && ./scripts/backup.sh >> /var/log/plantuml-backup.log 2>&1

set -euo pipefail

# ─── Validate required variables ───
if [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_DB:-}" ]; then
  echo "Error: POSTGRES_USER and POSTGRES_DB must be set."
  echo "Run: source .env && ./scripts/backup.sh"
  exit 1
fi

# ─── Validate required tools ───
for cmd in docker zstd; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' is not installed or not in PATH."
    exit 1
  fi
done

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_FILE="${BACKUP_DIR}/plantuml_${TIMESTAMP}.sql.zst"

echo "[$(date)] Starting backup..."

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Dump database with zstd compression
# --clean: include DROP statements so restore works on a non-empty database
# --if-exists: don't error on DROP if objects don't exist (fresh database)
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --format=plain \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  | zstd -3 > "${BACKUP_FILE}"

# Verify the backup file isn't empty
if [ ! -s "${BACKUP_FILE}" ]; then
  echo "[$(date)] Error: Backup file is empty — pg_dump may have failed."
  rm -f "${BACKUP_FILE}"
  exit 1
fi

echo "[$(date)] Dump complete: $(du -h "${BACKUP_FILE}" | cut -f1)"

# Encrypt if key is provided
if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  if ! command -v openssl &>/dev/null; then
    echo "Error: 'openssl' is not installed but BACKUP_ENCRYPTION_KEY is set."
    exit 1
  fi
  openssl enc -aes-256-cbc -salt -pbkdf2 \
    -in "${BACKUP_FILE}" \
    -out "${BACKUP_FILE}.enc" \
    -pass file:<(echo -n "${BACKUP_ENCRYPTION_KEY}")
  rm "${BACKUP_FILE}"
  BACKUP_FILE="${BACKUP_FILE}.enc"
  echo "[$(date)] Encrypted backup"
fi

# Upload to S3-compatible storage if configured
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if ! command -v aws &>/dev/null; then
    echo "Error: 'aws' CLI is not installed but BACKUP_S3_BUCKET is set."
    exit 1
  fi
  aws s3 cp "${BACKUP_FILE}" \
    "s3://${BACKUP_S3_BUCKET}/$(basename "${BACKUP_FILE}")" \
    ${BACKUP_S3_ENDPOINT:+--endpoint-url "${BACKUP_S3_ENDPOINT}"}
  echo "[$(date)] Uploaded to S3: s3://${BACKUP_S3_BUCKET}/$(basename "${BACKUP_FILE}")"
fi

# Prune local backups older than 7 days
find "${BACKUP_DIR}" -name "plantuml_*.sql.zst*" -mtime +7 -delete

echo "[$(date)] Backup complete: ${BACKUP_FILE}"
