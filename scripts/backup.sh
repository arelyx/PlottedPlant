#!/bin/bash
# scripts/backup.sh — Automated PostgreSQL backup with optional encryption and S3 upload
# Run via cron every 6 hours:
#   0 */6 * * * cd /opt/plantuml-ide && ./scripts/backup.sh >> /var/log/plantuml-backup.log 2>&1

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_FILE="${BACKUP_DIR}/plantuml_${TIMESTAMP}.sql.zst"

echo "[$(date)] Starting backup..."

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Dump database with zstd compression
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --format=plain \
  --no-owner \
  --no-privileges \
  | zstd -3 > "${BACKUP_FILE}"

echo "[$(date)] Dump complete: $(du -h "${BACKUP_FILE}" | cut -f1)"

# Encrypt if key is provided
if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  openssl enc -aes-256-cbc -salt -pbkdf2 \
    -in "${BACKUP_FILE}" \
    -out "${BACKUP_FILE}.enc" \
    -pass "pass:${BACKUP_ENCRYPTION_KEY}"
  rm "${BACKUP_FILE}"
  BACKUP_FILE="${BACKUP_FILE}.enc"
  echo "[$(date)] Encrypted backup"
fi

# Upload to S3-compatible storage if configured
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  aws s3 cp "${BACKUP_FILE}" \
    "s3://${BACKUP_S3_BUCKET}/$(basename "${BACKUP_FILE}")" \
    ${BACKUP_S3_ENDPOINT:+--endpoint-url "${BACKUP_S3_ENDPOINT}"}
  echo "[$(date)] Uploaded to S3: s3://${BACKUP_S3_BUCKET}/$(basename "${BACKUP_FILE}")"
fi

# Prune local backups older than 7 days
find "${BACKUP_DIR}" -name "plantuml_*.sql.zst*" -mtime +7 -delete

echo "[$(date)] Backup complete: ${BACKUP_FILE}"
