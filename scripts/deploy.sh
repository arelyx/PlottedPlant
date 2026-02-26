#!/usr/bin/env bash
# scripts/deploy.sh — Production deployment script for PlottedPlant
#
# Usage:
#   ./scripts/deploy.sh              # Full deploy (build + start)
#   ./scripts/deploy.sh --init       # First-time deploy (includes SSL cert setup)
#   ./scripts/deploy.sh --restart    # Restart only (no rebuild)
#   ./scripts/deploy.sh --dev        # Start in dev mode
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - .env file created from .env.example with secrets filled in
#   - DNS A records pointing to this server (for --init)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()  { echo -e "${RED}[deploy]${NC} $*" >&2; }

# ─────────────────────────────────────────────
# Preflight checks
# ─────────────────────────────────────────────
preflight() {
    if ! command -v docker &>/dev/null; then
        err "Docker is not installed. Install it first."
        exit 1
    fi

    if ! docker compose version &>/dev/null; then
        err "Docker Compose plugin is not installed."
        exit 1
    fi

    if [ ! -f .env ]; then
        err ".env file not found. Copy .env.example to .env and fill in secrets."
        exit 1
    fi

    # Source .env for domain info
    set -a
    source .env
    set +a
}

# ─────────────────────────────────────────────
# First-time SSL certificate setup
# ─────────────────────────────────────────────
init_ssl() {
    local domain="${PUBLIC_DOMAIN:?PUBLIC_DOMAIN not set in .env}"
    local email="${SMTP_FROM_EMAIL:-admin@$domain}"

    log "Checking for existing SSL certificates..."
    if [ -d "/etc/letsencrypt/live/$domain" ]; then
        warn "SSL certificates already exist for $domain. Skipping."
    else
        log "Obtaining SSL certificate for $domain and www.$domain..."

        if ! command -v certbot &>/dev/null; then
            log "Installing certbot..."
            sudo apt-get update -qq && sudo apt-get install -y -qq certbot
        fi

        # Stop anything on port 80
        sudo docker compose -f docker-compose.yml down 2>/dev/null || true

        sudo certbot certonly --standalone \
            -d "$domain" -d "www.$domain" \
            --non-interactive --agree-tos -m "$email"

        log "SSL certificate obtained successfully."
    fi

    # Copy certs to Docker volume
    log "Copying certificates to Docker volume..."
    docker volume create plantuml_certbot_certs 2>/dev/null || true
    sudo docker run --rm \
        -v plantuml_certbot_certs:/etc/letsencrypt \
        -v /etc/letsencrypt:/host-certs:ro \
        alpine sh -c "cp -a /host-certs/. /etc/letsencrypt/"
    log "Certificates copied to Docker volume."
}

# ─────────────────────────────────────────────
# Build frontend static assets
# ─────────────────────────────────────────────
build_frontend() {
    local public_url="${PUBLIC_URL:?PUBLIC_URL not set in .env}"
    local domain="${PUBLIC_DOMAIN:?PUBLIC_DOMAIN not set in .env}"

    log "Building frontend..."
    docker build -t plantuml-frontend-builder \
        --build-arg VITE_API_BASE_URL="$public_url/api/v1" \
        --build-arg VITE_WS_BASE_URL="wss://$domain/collaboration" \
        --build-arg VITE_PUBLIC_URL="$public_url" \
        -f frontend/Dockerfile frontend/

    # Extract dist
    rm -rf frontend/dist
    mkdir -p frontend/dist
    local cid
    cid=$(docker create --entrypoint="" plantuml-frontend-builder /bin/true 2>/dev/null || \
          docker create plantuml-frontend-builder true 2>/dev/null)
    docker cp "$cid":/dist/. frontend/dist/
    docker rm "$cid" >/dev/null
    log "Frontend built → frontend/dist/"
}

# ─────────────────────────────────────────────
# Start production
# ─────────────────────────────────────────────
start_prod() {
    log "Starting production stack..."
    sudo docker compose -f docker-compose.yml up -d --build

    log "Waiting for services to become healthy..."
    sleep 5
    sudo docker compose -f docker-compose.yml ps

    log "Running database migrations..."
    sudo docker compose -f docker-compose.yml exec -T backend alembic upgrade head

    log "Production stack is running."
    log "Site available at: https://${PUBLIC_DOMAIN}"
}

# ─────────────────────────────────────────────
# Start development
# ─────────────────────────────────────────────
start_dev() {
    log "Starting development stack..."
    sudo docker compose up -d --build

    log "Waiting for services to become healthy..."
    sleep 5
    sudo docker compose ps

    log "Running database migrations..."
    sudo docker compose exec -T backend alembic upgrade head

    log "Development stack is running at http://localhost"
}

# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
main() {
    preflight

    case "${1:-}" in
        --init)
            init_ssl
            build_frontend
            start_prod
            ;;
        --restart)
            log "Restarting production stack..."
            sudo docker compose -f docker-compose.yml down
            sudo docker compose -f docker-compose.yml up -d
            sudo docker compose -f docker-compose.yml ps
            ;;
        --dev)
            start_dev
            ;;
        *)
            build_frontend
            start_prod
            ;;
    esac
}

main "$@"
