# VPS Deployment Plan

## Executive Summary

This document provides a complete, step-by-step guide to deploy the PlantUML Collaborative IDE on a single VPS, targeting 50-500 concurrent users.

The application consists of seven Docker containers: Nginx (reverse proxy + TLS), FastAPI (REST API), Hocuspocus (WebSocket collaboration), PostgreSQL 16, Redis 7, PlantUML Server (Jetty), and Certbot (TLS certificate renewal). Two Docker networks isolate public-facing traffic (`frontend_net`) from internal data-plane traffic (`backend_net`, marked `internal: true`). Only Nginx is exposed to the host.

The codebase already ships with a production-ready `docker-compose.yml`, a production Nginx config with TLS/HSTS/security headers, multi-stage Dockerfiles with non-root users, PostgreSQL tuning for a 4GB VPS, backup/restore scripts with encryption and S3 upload, and a Certbot sidecar for automatic Let's Encrypt renewal. The primary work to go from development to production involves provisioning the VPS, configuring DNS, generating secrets, obtaining the initial TLS certificate, building the frontend, and setting up automated backups.

---

## VPS Requirements

### Minimum Specification (50 users)

| Resource | Minimum |
|----------|---------|
| CPU | 2 vCPUs |
| RAM | 4 GB |
| Storage | 40 GB SSD |
| Bandwidth | 2 TB/month |
| OS | Ubuntu 22.04 LTS or 24.04 LTS |

### Recommended Specification (up to 500 users)

| Resource | Recommended |
|----------|-------------|
| CPU | 4 vCPUs |
| RAM | 8 GB |
| Storage | 80 GB NVMe SSD |
| Bandwidth | 4 TB/month |
| OS | Ubuntu 24.04 LTS |

### Resource Breakdown by Service

These are the configured limits from `docker-compose.yml` and the PostgreSQL config:

| Service | Memory Limit | Memory Reservation | CPU Limit | Notes |
|---------|-------------|-------------------|-----------|-------|
| PostgreSQL | 2 GB | 512 MB | -- | `shm_size: 256m`, tuned for 4 GB VPS in `postgresql.conf` |
| PlantUML Server | 1 GB | 512 MB | 1.0 CPU | JVM-based, can spike during rendering |
| Redis | 300 MB | -- | -- | `maxmemory 256mb`, ephemeral cache only |
| Backend (FastAPI) | -- | -- | -- | 4 Uvicorn workers, ~100-200 MB typical |
| Collaboration (Hocuspocus) | -- | -- | -- | Node.js, ~100-200 MB typical |
| Nginx | -- | -- | -- | ~20-50 MB |
| Certbot | -- | -- | -- | Runs briefly every 12 hours |

**Total baseline memory: ~3-4 GB.** With 8 GB RAM, the OS and all services have comfortable headroom. With 4 GB RAM, it works but leaves less margin for spikes during concurrent PlantUML renders.

### Recommended VPS Providers

| Provider | Plan | Approx. Cost | Notes |
|----------|------|-------------|-------|
| Hetzner Cloud | CPX31 (4 vCPU, 8 GB, 160 GB) | ~$15/month | Best value, EU/US datacenters |
| DigitalOcean | Premium Droplet (4 vCPU, 8 GB, 160 GB NVMe) | ~$56/month | Good US coverage |
| Vultr | High Frequency (4 vCPU, 8 GB, 128 GB NVMe) | ~$48/month | Global presence |
| Linode/Akamai | Dedicated 8GB (4 vCPU, 8 GB, 160 GB) | ~$65/month | Reliable, good support |
| OVH | B2-15 (4 vCPU, 15 GB, 100 GB NVMe) | ~$26/month | Excellent value, EU focus |

---

## Pre-Deployment Checklist

Complete every item before proceeding to the deployment steps.

- [ ] **Domain name registered** and accessible via your DNS provider
- [ ] **VPS provisioned** with the recommended specs above
- [ ] **SSH key** generated locally and added to the VPS during provisioning
- [ ] **DNS A record** pointing your domain (e.g., `app.example.com`) to the VPS IP address
- [ ] **DNS propagation confirmed** (`dig +short app.example.com` returns the VPS IP)
- [ ] **SMTP credentials** ready (from SES, Mailgun, Postmark, or similar)
- [ ] **OAuth credentials** created (optional, for Google/GitHub login):
  - Google: https://console.cloud.google.com/apis/credentials
  - GitHub: https://github.com/settings/applications/new
- [ ] **S3-compatible storage** provisioned for backups (optional but recommended):
  - Backblaze B2, AWS S3, Wasabi, or MinIO
  - Bucket created, access key and secret key in hand
- [ ] **Git repository** accessible from the VPS (SSH key or deploy token configured)

---

## Step-by-Step Deployment Guide

### 1. VPS Initial Setup

SSH into the VPS as root, then harden the system.

```bash
# Update the system
apt update && apt upgrade -y

# Create a non-root deploy user
adduser deploy
usermod -aG sudo deploy

# Copy SSH key to the deploy user
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Disable root SSH login and password authentication
sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Set up UFW firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp       # SSH
ufw allow 80/tcp       # HTTP (for Let's Encrypt + redirect)
ufw allow 443/tcp      # HTTPS
ufw enable

# Install fail2ban for SSH brute-force protection
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Set timezone to UTC
timedatectl set-timezone UTC

# Enable automatic security updates
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

**Verify:** Log out and SSH back in as the `deploy` user to confirm key-based login works before proceeding.

```bash
ssh deploy@YOUR_VPS_IP
```

### 2. Install Dependencies

All remaining commands run as the `deploy` user.

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy

# Log out and back in for group change to take effect
exit
# ssh deploy@YOUR_VPS_IP

# Verify Docker
docker --version
docker compose version

# Install additional tools
sudo apt install -y git zstd awscli

# zstd — required by backup/restore scripts
# awscli — required for S3 backup uploads (optional)
```

### 3. Domain & DNS Configuration

Create a DNS A record pointing to the VPS:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `app.example.com` | `YOUR_VPS_IP` | 300 |

If you want `www.app.example.com` to work as well:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | `www.app` | `app.example.com` | 300 |

**Verify DNS propagation:**

```bash
dig +short app.example.com
# Should return YOUR_VPS_IP
```

Wait for DNS to propagate before proceeding (can take up to 48 hours, usually 5-30 minutes).

### 4. Clone & Configure

```bash
# Clone the repository
sudo mkdir -p /opt/plantuml-ide
sudo chown deploy:deploy /opt/plantuml-ide
git clone git@github.com:YOUR_ORG/plottedplant.git /opt/plantuml-ide
cd /opt/plantuml-ide
```

#### Generate Production Secrets

```bash
# Generate strong random secrets
echo "Postgres password:"
openssl rand -base64 32

echo "JWT secret key:"
openssl rand -hex 64

echo "Internal secret:"
openssl rand -hex 32

echo "Backup encryption key:"
openssl rand -hex 32
```

#### Create the `.env` File

```bash
cp .env.example .env
nano .env
```

Fill in every value. Here is a complete reference:

```bash
# ─── PostgreSQL ───
# The database user, password, and database name.
# Use the generated password from above. Do not use the default.
POSTGRES_USER=plantuml
POSTGRES_PASSWORD=<GENERATED_PASSWORD_FROM_ABOVE>
POSTGRES_DB=plantuml

# ─── Security ───
# JWT secret for signing access/refresh tokens. Use the 128-char hex string.
JWT_SECRET_KEY=<GENERATED_HEX_64_FROM_ABOVE>
# Shared secret between FastAPI and Hocuspocus for internal API auth.
INTERNAL_SECRET=<GENERATED_HEX_32_FROM_ABOVE>

# ─── OAuth — Google (optional) ───
# Create at: https://console.cloud.google.com/apis/credentials
# Set Authorized redirect URI to: https://app.example.com/api/v1/auth/callback/google
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=

# ─── OAuth — GitHub (optional) ───
# Create at: https://github.com/settings/applications/new
# Set Authorization callback URL to: https://app.example.com/api/v1/auth/callback/github
OAUTH_GITHUB_CLIENT_ID=
OAUTH_GITHUB_CLIENT_SECRET=

# ─── SMTP (email for password resets) ───
# Use any transactional email provider: AWS SES, Mailgun, Postmark, SendGrid.
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=<SMTP_USERNAME>
SMTP_PASSWORD=<SMTP_PASSWORD>
SMTP_FROM_EMAIL=noreply@app.example.com

# ─── Public URL ───
# The URL users access in their browser. No trailing slash.
# Used for CORS, OAuth redirect URLs, and email links.
PUBLIC_URL=https://app.example.com
PUBLIC_DOMAIN=app.example.com

# ─── Backup (optional but recommended) ───
# S3-compatible bucket for offsite backup storage.
BACKUP_S3_BUCKET=plantuml-backups
BACKUP_S3_ACCESS_KEY=<S3_ACCESS_KEY>
BACKUP_S3_SECRET_KEY=<S3_SECRET_KEY>
BACKUP_S3_ENDPOINT=https://s3.us-west-002.backblazeb2.com
BACKUP_ENCRYPTION_KEY=<GENERATED_HEX_32_FROM_ABOVE>
```

**Security check:** Verify the `.env` file is not world-readable.

```bash
chmod 600 .env
ls -la .env
# Should show: -rw------- 1 deploy deploy ...
```

### 5. TLS/HTTPS Setup

The production `docker-compose.yml` includes a Certbot sidecar and the Nginx config (`nginx/nginx.conf`) is already configured for HTTPS with Let's Encrypt certificates. However, you need to obtain the initial certificate before starting the full stack.

#### Update the Nginx Config with Your Domain

The production Nginx config at `nginx/nginx.conf` references `app.example.com` as a placeholder for the TLS certificate paths. Update it:

```bash
cd /opt/plantuml-ide
sed -i "s/app.example.com/${PUBLIC_DOMAIN}/g" nginx/nginx.conf
```

This changes the two lines:
- `ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;`
- `ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;`

To use your actual domain.

#### Obtain the Initial Certificate

The initial certificate must be obtained before Nginx can start with the HTTPS config. Use a temporary HTTP-only approach:

```bash
# Step 1: Create directories for certbot
docker volume create plantuml_certbot_certs
docker volume create plantuml_certbot_webroot

# Step 2: Start a temporary Nginx that serves only the ACME challenge
docker run -d --name temp-nginx \
  -p 80:80 \
  -v plantuml_certbot_webroot:/var/www/certbot \
  nginx:1.27-alpine \
  sh -c 'mkdir -p /var/www/certbot && echo "server { listen 80; location /.well-known/acme-challenge/ { root /var/www/certbot; } location / { return 200 \"ok\"; } }" > /etc/nginx/conf.d/default.conf && nginx -g "daemon off;"'

# Step 3: Request the certificate
docker run --rm \
  -v plantuml_certbot_certs:/etc/letsencrypt \
  -v plantuml_certbot_webroot:/var/www/certbot \
  certbot/certbot:latest \
  certonly --webroot -w /var/www/certbot \
  -d app.example.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email

# Step 4: Stop and remove the temporary Nginx
docker stop temp-nginx && docker rm temp-nginx
```

**Verify** the certificate was obtained:

```bash
docker run --rm -v plantuml_certbot_certs:/etc/letsencrypt alpine \
  ls /etc/letsencrypt/live/
# Should list: app.example.com
```

### 6. Docker Compose Production Configuration

The `docker-compose.yml` in the repository **is already the production configuration**. The development overrides live in `docker-compose.override.yml`, which Docker Compose automatically merges during `docker compose up`. For production, you must prevent this merge.

#### Build the Frontend Static Assets

The production Nginx serves pre-built static files from `frontend/dist/`. The frontend `Dockerfile` is a build-only image that outputs to a `scratch` filesystem.

```bash
cd /opt/plantuml-ide

# Build the frontend with production environment variables
docker build \
  --build-arg VITE_API_BASE_URL=https://app.example.com/api/v1 \
  --build-arg VITE_WS_BASE_URL=wss://app.example.com/collaboration \
  --build-arg VITE_PUBLIC_URL=https://app.example.com \
  -t plantuml-frontend-build \
  -f frontend/Dockerfile \
  frontend/

# Extract the dist/ folder from the build image
mkdir -p frontend/dist
docker create --name frontend-extract plantuml-frontend-build true
docker cp frontend-extract:/dist/. frontend/dist/
docker rm frontend-extract
```

**Verify** the build output:

```bash
ls frontend/dist/
# Should show: index.html, assets/, etc.
```

#### Start Production Without Dev Overrides

The key production change is to **exclude** `docker-compose.override.yml`:

```bash
cd /opt/plantuml-ide

# Use only the base docker-compose.yml (skip the override file)
docker compose -f docker-compose.yml up -d --build
```

Alternatively, rename or move the override file so it is never accidentally loaded:

```bash
mv docker-compose.override.yml docker-compose.override.yml.dev
```

Then the standard command works:

```bash
docker compose up -d --build
```

#### What Changes Between Dev and Production

| Aspect | Development (`override.yml`) | Production (`docker-compose.yml` only) |
|--------|------------------------------|----------------------------------------|
| Frontend | Vite dev server with HMR (container) | Static files served by Nginx (no container) |
| Nginx config | `nginx.dev.conf` — HTTP only | `nginx.conf` — HTTPS, HSTS, security headers |
| Nginx ports | 80 only | 80 (redirect) + 443 (HTTPS) |
| Backend CMD | `uvicorn --reload` (single worker) | `uvicorn --workers 4 --loop uvloop` |
| Backend `APP_ENV` | `development` | `production` |
| Backend `LOG_LEVEL` | `debug` | `info` |
| CORS origins | `http://localhost,http://localhost:3000` | `https://app.example.com` |
| OpenAPI docs | Enabled at `/api/v1/docs` | Disabled (set to `None`) |
| PostgreSQL port | Exposed on host `:5432` | Not exposed (backend_net only) |
| Redis port | Exposed on host `:6379` | Not exposed (backend_net only) |
| Certbot | Disabled (`profiles: [production]`) | Running, renews every 12 hours |
| Source volumes | Mounted for live reload | Not mounted (code baked into images) |

### 7. Database Setup

After the containers start, run the Alembic migrations to create all tables:

```bash
cd /opt/plantuml-ide

# Run all migrations
docker compose -f docker-compose.yml exec backend alembic upgrade head

# Seed template library (optional but recommended)
docker compose -f docker-compose.yml exec backend python -m app.scripts.seed_templates
```

**Verify** the database:

```bash
# Check that tables were created
docker compose -f docker-compose.yml exec postgres \
  psql -U plantuml -d plantuml -c "\dt"

# Should list: users, documents, folders, document_content,
# document_versions, refresh_tokens, oauth_accounts,
# password_reset_tokens, templates, user_preferences,
# document_shares, folder_shares, public_share_links
```

### 8. Start Services

If you have not already started the stack:

```bash
cd /opt/plantuml-ide
docker compose -f docker-compose.yml up -d --build
```

Wait for all containers to become healthy:

```bash
# Watch container status (repeat until all show "healthy")
docker compose -f docker-compose.yml ps

# Expected output:
# plantuml-nginx          running (healthy)
# plantuml-backend        running (healthy)
# plantuml-collaboration  running (healthy)
# plantuml-postgres       running (healthy)
# plantuml-redis          running (healthy)
# plantuml-renderer       running (healthy)
# plantuml-certbot        running
```

The Certbot container does not have a healthcheck. It runs a renewal loop every 12 hours.

### 9. Post-Deployment Verification

Run through each of these checks to confirm the deployment is working:

```bash
# 1. Nginx health check (should return "ok")
curl -s https://app.example.com/health
# Expected: ok

# 2. Backend health check (should return JSON with status "healthy")
curl -s https://app.example.com/api/v1/health | python3 -m json.tool
# Expected: {"status": "healthy", "version": "1.0.0", "timestamp": "..."}

# 3. Detailed health check (verifies DB + Redis connectivity)
curl -s https://app.example.com/api/v1/health/detailed | python3 -m json.tool
# Expected: {"status": "healthy", "dependencies": {"database": "connected", "redis": "connected"}, ...}

# 4. HTTP-to-HTTPS redirect
curl -s -o /dev/null -w "%{http_code}" http://app.example.com/
# Expected: 301

# 5. TLS certificate validity
echo | openssl s_client -connect app.example.com:443 -servername app.example.com 2>/dev/null | openssl x509 -noout -dates
# Should show valid dates from Let's Encrypt

# 6. Internal endpoints are blocked from public access
curl -s -o /dev/null -w "%{http_code}" https://app.example.com/api/v1/internal/auth/validate
# Expected: 404

# 7. OpenAPI docs are disabled in production
curl -s -o /dev/null -w "%{http_code}" https://app.example.com/api/v1/docs
# Expected: 404 (or 307 redirect to /)

# 8. Frontend loads
curl -s -o /dev/null -w "%{http_code}" https://app.example.com/
# Expected: 200

# 9. HSTS header present
curl -sI https://app.example.com/ | grep -i strict-transport
# Expected: strict-transport-security: max-age=31536000; includeSubDomains

# 10. Check container logs for errors
docker compose -f docker-compose.yml logs --tail 50 backend | grep -i error
docker compose -f docker-compose.yml logs --tail 50 collaboration | grep -i error
docker compose -f docker-compose.yml logs --tail 50 nginx | grep -i error
```

**Functional smoke test:**

1. Open `https://app.example.com` in a browser.
2. Register a new account.
3. Create a new document.
4. Enter PlantUML code (e.g., `@startuml\nAlice -> Bob: Hello\n@enduml`).
5. Verify the preview renders.
6. Open the same document in a second browser tab/incognito window and verify real-time collaboration works.

---

## Production Configuration Changes

### Nginx (Reference: `nginx/nginx.conf`)

The production Nginx configuration is already comprehensive. Key features:

```
File: nginx/nginx.conf
```

| Directive | Purpose |
|-----------|---------|
| `worker_processes auto` | Scales workers to CPU count |
| `worker_connections 1024` | Handles up to 1024 simultaneous connections per worker |
| `gzip on` + types | Compresses text-based responses (HTML, CSS, JS, JSON, SVG) |
| `X-Frame-Options SAMEORIGIN` | Prevents clickjacking |
| `X-Content-Type-Options nosniff` | Prevents MIME sniffing |
| `Content-Security-Policy` | Restricts resource loading to same origin + `wss:` for WebSocket |
| `Permissions-Policy` | Disables camera, microphone, geolocation |
| `client_max_body_size 1m` | Limits request body to 1 MB |
| HTTP-to-HTTPS redirect | Port 80 redirects all traffic to 443 (except ACME challenges) |
| `ssl_protocols TLSv1.2 TLSv1.3` | Modern TLS only |
| `ssl_session_cache shared:SSL:10m` | TLS session resumption for performance |
| HSTS `max-age=31536000` | Tells browsers to always use HTTPS |
| `/api/v1/internal/` → `deny all` | Blocks public access to internal endpoints |
| `/collaboration` → WebSocket proxy | 1-hour timeout for long-lived WS connections |
| Static asset caching `expires 1y` | Immutable cache for JS/CSS/images with content hashes |
| `upstream backend { keepalive 32 }` | Persistent connections to backend |

**One required change:** Replace `app.example.com` in the `ssl_certificate` and `ssl_certificate_key` paths with your actual domain (done in Step 5 above).

### Docker Compose

The production `docker-compose.yml` is ready as-is. Key production features already configured:

- `restart: unless-stopped` on all services
- Health checks with `start_period` on every service
- Resource limits on PostgreSQL (2 GB), PlantUML (1 GB/1 CPU), Redis (300 MB)
- `shm_size: 256m` for PostgreSQL
- Named volumes for data persistence
- `backend_net` marked `internal: true` (no external access)
- Certbot sidecar with 12-hour renewal loop
- Non-root users in all application Dockerfiles

#### Optional: Add Resource Limits for Backend and Collaboration

For a fully resource-constrained deployment, add limits:

```yaml
# Add to the backend service in docker-compose.yml
backend:
  deploy:
    resources:
      limits:
        memory: 1G
        cpus: "2.0"
      reservations:
        memory: 256M

# Add to the collaboration service
collaboration:
  deploy:
    resources:
      limits:
        memory: 512M
        cpus: "1.0"
      reservations:
        memory: 128M
```

#### Optional: Docker Logging Configuration

Add log rotation to prevent disk exhaustion:

```yaml
# Add to each service in docker-compose.yml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "5"
```

### Environment Variables

Complete reference for every environment variable used in production:

| Variable | Source | Required | Description |
|----------|--------|----------|-------------|
| `POSTGRES_USER` | `.env` | Yes | PostgreSQL username |
| `POSTGRES_PASSWORD` | `.env` | Yes | PostgreSQL password. Generate with `openssl rand -base64 32` |
| `POSTGRES_DB` | `.env` | Yes | PostgreSQL database name |
| `JWT_SECRET_KEY` | `.env` | Yes | 128-character hex string for JWT signing. Generate with `openssl rand -hex 64` |
| `INTERNAL_SECRET` | `.env` | Yes | Shared secret for backend-collaboration auth. Generate with `openssl rand -hex 32` |
| `PUBLIC_URL` | `.env` | Yes | Full URL users see in browser (e.g., `https://app.example.com`). Used for CORS, OAuth redirects, email links |
| `PUBLIC_DOMAIN` | `.env` | Yes | Domain name without protocol (e.g., `app.example.com`). Used in Nginx/Certbot config |
| `OAUTH_GOOGLE_CLIENT_ID` | `.env` | No | Google OAuth client ID |
| `OAUTH_GOOGLE_CLIENT_SECRET` | `.env` | No | Google OAuth client secret |
| `OAUTH_GITHUB_CLIENT_ID` | `.env` | No | GitHub OAuth client ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | `.env` | No | GitHub OAuth client secret |
| `SMTP_HOST` | `.env` | No* | SMTP server hostname. *Required if password reset is needed |
| `SMTP_PORT` | `.env` | No | SMTP port (default: 587) |
| `SMTP_USER` | `.env` | No | SMTP authentication username |
| `SMTP_PASSWORD` | `.env` | No | SMTP authentication password |
| `SMTP_FROM_EMAIL` | `.env` | No | Sender email address for transactional emails |
| `BACKUP_S3_BUCKET` | `.env` | No | S3 bucket name for offsite backups |
| `BACKUP_S3_ACCESS_KEY` | `.env` | No | S3 access key |
| `BACKUP_S3_SECRET_KEY` | `.env` | No | S3 secret key |
| `BACKUP_S3_ENDPOINT` | `.env` | No | S3 endpoint URL (for non-AWS S3-compatible services) |
| `BACKUP_ENCRYPTION_KEY` | `.env` | No | AES-256 encryption key for backup files. Generate with `openssl rand -hex 32` |

These are set directly in `docker-compose.yml` and should not need modification:

| Variable | Value | Set In |
|----------|-------|--------|
| `APP_ENV` | `production` | `docker-compose.yml` |
| `DATABASE_URL` | `postgresql+asyncpg://...` | `docker-compose.yml` (composed from `POSTGRES_*`) |
| `REDIS_URL` | `redis://redis:6379/0` | `docker-compose.yml` |
| `PLANTUML_SERVER_URL` | `http://plantuml:8080` | `docker-compose.yml` |
| `COLLABORATION_SERVER_URL` | `http://collaboration:1235` | `docker-compose.yml` |
| `CORS_ORIGINS` | `${PUBLIC_URL}` | `docker-compose.yml` |
| `LOG_LEVEL` | `info` | `docker-compose.yml` |
| `NODE_ENV` | `production` | `docker-compose.yml` |
| `WEBSOCKET_PORT` | `1234` | `docker-compose.yml` |
| `COMMAND_PORT` | `1235` | `docker-compose.yml` |
| `DEBOUNCE_MS` | `2000` | `docker-compose.yml` |
| `MAX_DEBOUNCE_MS` | `10000` | `docker-compose.yml` |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | `docker-compose.yml` |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | `30` | `docker-compose.yml` |
| `SMTP_USE_TLS` | `true` | `docker-compose.yml` |
| `PLANTUML_LIMIT_SIZE` | `16384` | `docker-compose.yml` |
| `ALLOW_PLANTUML_INCLUDE` | `false` | `docker-compose.yml` |

### PostgreSQL Tuning (Reference: `postgres/postgresql.conf`)

The existing `postgresql.conf` is already tuned for a 4 GB VPS. For an 8 GB VPS, adjust:

```
# postgres/postgresql.conf — Tuned for 8 GB VPS

# Connection
listen_addresses = '*'
max_connections = 100
superuser_reserved_connections = 3

# Memory (8 GB total, ~4 GB for PostgreSQL)
shared_buffers = 1GB              # was 512MB
effective_cache_size = 3GB         # was 1536MB
work_mem = 16MB                    # was 8MB
maintenance_work_mem = 256MB       # was 128MB

# WAL
wal_level = replica
max_wal_size = 2GB                 # was 1GB
min_wal_size = 80MB
checkpoint_completion_target = 0.9

# Query planner
random_page_cost = 1.1
effective_io_concurrency = 200
default_statistics_target = 100

# TOAST compression
default_toast_compression = lz4

# Logging
log_min_duration_statement = 500
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
log_statement = 'ddl'
log_timezone = 'UTC'

# Locale
timezone = 'UTC'
lc_messages = 'en_US.utf8'
```

Also update the Docker Compose memory limit for PostgreSQL if on 8 GB:

```yaml
postgres:
  deploy:
    resources:
      limits:
        memory: 4G     # was 2G
      reservations:
        memory: 1G     # was 512M
  shm_size: '512m'     # was 256m
```

### Redis Configuration

Redis is already configured in `docker-compose.yml` with production-appropriate settings:

```yaml
command: >
  redis-server
  --maxmemory 256mb
  --maxmemory-policy allkeys-lru
  --appendonly no
  --save ""
```

- **No persistence** (`appendonly no`, `save ""`): Redis is used only as an ephemeral cache for render results and rate limiting state. Data loss on restart is acceptable.
- **LRU eviction** (`allkeys-lru`): When memory is full, least-recently-used keys are evicted.
- **256 MB cap**: Sufficient for thousands of cached PlantUML renders.

No changes needed for production.

---

## Backup & Recovery

### Automated Backups

The repository includes backup and restore scripts at `scripts/backup.sh` and `scripts/restore.sh`.

#### How `scripts/backup.sh` Works

1. Runs `pg_dump` inside the PostgreSQL container
2. Compresses with `zstd` (level 3)
3. Optionally encrypts with AES-256-CBC using `BACKUP_ENCRYPTION_KEY`
4. Optionally uploads to S3-compatible storage using `BACKUP_S3_*` variables
5. Prunes local backups older than 7 days

#### Set Up the Cron Job

```bash
# Make the script executable
chmod +x /opt/plantuml-ide/scripts/backup.sh

# Create a log file
sudo touch /var/log/plantuml-backup.log
sudo chown deploy:deploy /var/log/plantuml-backup.log

# Edit crontab for the deploy user
crontab -e
```

Add this line for backups every 6 hours:

```
0 */6 * * * cd /opt/plantuml-ide && source .env && BACKUP_DIR=/opt/plantuml-ide/backups ./scripts/backup.sh >> /var/log/plantuml-backup.log 2>&1
```

Create the local backup directory:

```bash
mkdir -p /opt/plantuml-ide/backups
```

#### Verify the Backup

Run the backup manually to confirm it works:

```bash
cd /opt/plantuml-ide
source .env
BACKUP_DIR=/opt/plantuml-ide/backups ./scripts/backup.sh
ls -la /opt/plantuml-ide/backups/
```

### Disaster Recovery

#### Restore from Backup

Use `scripts/restore.sh`:

```bash
cd /opt/plantuml-ide
source .env

# From an unencrypted backup
./scripts/restore.sh /opt/plantuml-ide/backups/plantuml_20260223_120000.sql.zst

# From an encrypted backup (requires BACKUP_ENCRYPTION_KEY in environment)
./scripts/restore.sh /opt/plantuml-ide/backups/plantuml_20260223_120000.sql.zst.enc
```

The script will:
1. Ask for confirmation (destructive operation)
2. Stop the backend and collaboration services
3. Decompress and load the SQL dump
4. Run Alembic migrations to ensure schema is up-to-date
5. Restart the application services

#### Restore from S3

```bash
# Download from S3
aws s3 cp \
  s3://plantuml-backups/plantuml_20260223_120000.sql.zst.enc \
  /opt/plantuml-ide/backups/ \
  --endpoint-url https://s3.us-west-002.backblazeb2.com

# Then restore
cd /opt/plantuml-ide
source .env
./scripts/restore.sh /opt/plantuml-ide/backups/plantuml_20260223_120000.sql.zst.enc
```

#### RTO/RPO Targets

| Metric | Target | Notes |
|--------|--------|-------|
| RPO (Recovery Point Objective) | 6 hours | Matches the backup frequency. Can reduce to 1 hour with more frequent cron. |
| RTO (Recovery Time Objective) | 30 minutes | Time to provision a new VPS, restore from S3, and verify. |

To reduce RPO to near-zero, enable PostgreSQL WAL archiving to S3 (requires additional configuration not included in this setup).

---

## Monitoring & Maintenance

### Log Management

#### Docker Log Rotation

Add to each service in `docker-compose.yml` to prevent disk exhaustion:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "5"
```

This limits each container to 5 log files of 10 MB each (50 MB total per container, ~350 MB for all 7 containers).

#### View Logs

```bash
# All services
docker compose -f docker-compose.yml logs -f --tail 100

# Specific service
docker compose -f docker-compose.yml logs -f --tail 100 backend
docker compose -f docker-compose.yml logs -f --tail 100 collaboration
docker compose -f docker-compose.yml logs -f --tail 100 nginx

# PostgreSQL slow queries (logged at >500ms per postgresql.conf)
docker compose -f docker-compose.yml logs postgres | grep "duration:"
```

### Health Monitoring

#### Built-In Health Endpoints

| Endpoint | Checks |
|----------|--------|
| `GET /health` (Nginx) | Nginx is running |
| `GET /api/v1/health` (Backend) | FastAPI is running |
| `GET /api/v1/health/detailed` (Backend) | PostgreSQL + Redis connectivity |
| `GET :1235/health` (Collaboration, internal) | Hocuspocus is running |

#### Simple Uptime Monitoring Script

Create `/opt/plantuml-ide/scripts/healthcheck.sh`:

```bash
#!/bin/bash
# Simple health check — call from cron every 5 minutes
DOMAIN="https://app.example.com"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${DOMAIN}/api/v1/health/detailed" --max-time 10)

if [ "$STATUS" != "200" ]; then
  echo "[$(date)] ALERT: Health check failed with status ${STATUS}" >> /var/log/plantuml-health.log
  # Optionally send an alert via webhook, email, etc.
  # curl -X POST https://hooks.slack.com/services/... -d '{"text":"PlottedPlant health check failed!"}'
fi
```

```bash
chmod +x /opt/plantuml-ide/scripts/healthcheck.sh
crontab -e
# Add:
*/5 * * * * /opt/plantuml-ide/scripts/healthcheck.sh
```

#### Recommended External Monitoring

For production, use an external uptime monitor that alerts when the service is down:

- **UptimeRobot** (free tier: 50 monitors, 5-minute intervals)
- **BetterStack** (formerly Better Uptime)
- **Uptime Kuma** (self-hosted, can run on the same VPS)

Monitor these URLs:
- `https://app.example.com/health` (Nginx)
- `https://app.example.com/api/v1/health` (Backend)

#### Disk Space Monitoring

```bash
# Check disk usage
df -h /

# Check Docker volume sizes
docker system df -v
```

Add a cron job to alert on low disk space:

```bash
# Add to crontab
0 * * * * [ $(df / --output=pcent | tail -1 | tr -d ' %') -gt 85 ] && echo "[$(date)] DISK SPACE WARNING: $(df -h / | tail -1)" >> /var/log/plantuml-health.log
```

### Update Procedure

#### Deploying Code Updates

```bash
cd /opt/plantuml-ide

# 1. Pull the latest code
git fetch origin
git pull origin main

# 2. Rebuild the frontend static assets
docker build \
  --build-arg VITE_API_BASE_URL=https://app.example.com/api/v1 \
  --build-arg VITE_WS_BASE_URL=wss://app.example.com/collaboration \
  --build-arg VITE_PUBLIC_URL=https://app.example.com \
  -t plantuml-frontend-build \
  -f frontend/Dockerfile \
  frontend/
docker create --name frontend-extract plantuml-frontend-build true
rm -rf frontend/dist
docker cp frontend-extract:/dist/. frontend/dist/
docker rm frontend-extract

# 3. Rebuild and restart backend + collaboration (Nginx picks up new static files automatically)
docker compose -f docker-compose.yml up -d --build backend collaboration

# 4. Run any new database migrations
docker compose -f docker-compose.yml exec backend alembic upgrade head

# 5. Verify health
curl -s https://app.example.com/api/v1/health/detailed | python3 -m json.tool
```

**Notes on downtime:**

- The backend runs 4 Uvicorn workers. During rebuild, there is a brief (5-15 second) window where the backend is unavailable. Nginx will return 502 during this window.
- For zero-downtime deployments, use a blue-green approach: build a new container, health check it, then swap. This is beyond the scope of a single-VPS deployment but can be achieved with Docker Compose profiles or a container orchestrator.
- WebSocket connections will be dropped when the collaboration server restarts. The Hocuspocus client automatically reconnects.

#### Database Migration Procedure

```bash
# Always backup before migrating
cd /opt/plantuml-ide
source .env
BACKUP_DIR=/opt/plantuml-ide/backups ./scripts/backup.sh

# Run migrations
docker compose -f docker-compose.yml exec backend alembic upgrade head

# If a migration fails, restore from backup
./scripts/restore.sh /opt/plantuml-ide/backups/<latest-backup-file>
```

### SSL Certificate Renewal

The Certbot container handles this automatically. It runs a renewal check every 12 hours:

```yaml
# From docker-compose.yml
certbot:
  entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew --webroot -w /var/www/certbot --quiet; sleep 12h & wait $${!}; done'"
```

Let's Encrypt certificates are valid for 90 days. Certbot renews when a certificate is within 30 days of expiration.

**After a successful renewal, Nginx needs to reload to pick up the new certificate.** Add a cron job:

```bash
crontab -e
# Add (runs daily at 3:30 AM, reloads Nginx to pick up any renewed certs):
30 3 * * * docker exec plantuml-nginx nginx -s reload >> /var/log/plantuml-certbot.log 2>&1
```

**Manual renewal test:**

```bash
docker compose -f docker-compose.yml exec certbot certbot renew --dry-run
```

---

## Security Hardening for Production

### Firewall Rules (Already Configured in Step 1)

```bash
# Verify firewall status
sudo ufw status verbose

# Expected:
# Status: active
# Default: deny (incoming), allow (outgoing), disabled (routed)
# 22/tcp    ALLOW IN    Anywhere
# 80/tcp    ALLOW IN    Anywhere
# 443/tcp   ALLOW IN    Anywhere
```

No other ports should be open. PostgreSQL (5432), Redis (6379), and the PlantUML server (8080) are only accessible within the Docker `backend_net` network.

### Docker Security

The application already implements several Docker security best practices:

1. **Non-root containers**: Both `backend/Dockerfile` and `collaboration/Dockerfile` create and switch to a non-root user (`appuser`).

   ```dockerfile
   # backend/Dockerfile
   RUN groupadd -r appuser && useradd -r -g appuser appuser
   USER appuser

   # collaboration/Dockerfile
   RUN addgroup -S appgroup && adduser -S appuser -G appgroup
   USER appuser
   ```

2. **Multi-stage builds**: Both backend and collaboration Dockerfiles use multi-stage builds to minimize the final image size and exclude build tools.

3. **Internal network**: The `backend_net` network is marked `internal: true`, which means containers on it cannot initiate outbound connections to the internet. Only `frontend_net` has external access.

4. **PlantUML sandboxing**: `ALLOW_PLANTUML_INCLUDE=false` prevents the PlantUML server from reading files off the filesystem.

5. **Internal endpoint blocking**: Nginx blocks all public access to `/api/v1/internal/` with `deny all; return 404;`.

#### Additional Hardening (Optional)

Add read-only root filesystems where possible:

```yaml
# In docker-compose.yml
redis:
  read_only: true
  tmpfs:
    - /tmp

nginx:
  read_only: true
  tmpfs:
    - /var/cache/nginx
    - /var/run
    - /tmp
```

### Secret Management

All secrets are stored in the `.env` file, which is:
- Listed in `.gitignore` (never committed)
- Set to `chmod 600` (only readable by the owner)
- Only `.env.example` is committed as a template

**Secret generation commands:**

```bash
# PostgreSQL password (32 bytes, base64 encoded)
openssl rand -base64 32

# JWT secret key (64 bytes, hex encoded = 128 character string)
openssl rand -hex 64

# Internal secret (32 bytes, hex encoded = 64 character string)
openssl rand -hex 32

# Backup encryption key (32 bytes, hex encoded = 64 character string)
openssl rand -hex 32
```

**Rotating secrets:**

| Secret | Rotation Procedure |
|--------|-------------------|
| `JWT_SECRET_KEY` | Change in `.env`, restart backend. All existing access tokens and refresh tokens become invalid. Users must log in again. |
| `INTERNAL_SECRET` | Change in `.env`, restart both backend and collaboration simultaneously. Mismatched secrets break collaboration sync. |
| `POSTGRES_PASSWORD` | Change in PostgreSQL first (`ALTER USER plantuml PASSWORD '...'`), then update `.env`, then restart backend. |
| `BACKUP_ENCRYPTION_KEY` | Old backups can only be decrypted with the old key. Keep old key documented. New backups use the new key. |

### SSH Hardening (Already Configured in Step 1)

- Root login disabled
- Password authentication disabled (key-only)
- fail2ban running for brute-force protection

Additional optional hardening:

```bash
# Change SSH port (e.g., to 2222)
sudo sed -i 's/^#Port 22/Port 2222/' /etc/ssh/sshd_config
sudo systemctl restart sshd
sudo ufw delete allow 22/tcp
sudo ufw allow 2222/tcp

# Limit SSH access to specific IPs (if you have a static IP)
sudo ufw delete allow 2222/tcp
sudo ufw allow from YOUR_IP to any port 2222
```

---

## Scaling Considerations

### Bottleneck Analysis

At 500 concurrent users, the likely bottlenecks in order of impact:

1. **PlantUML rendering** (CPU-bound): Each render is a JVM process. The server is limited to 1 CPU and 1 GB RAM. Under heavy rendering load, this is the first thing to saturate.

2. **WebSocket connections** (memory-bound): Each active collaboration session holds a Yjs CRDT document in memory. With 500 users editing 200 documents simultaneously, the collaboration server may need 500+ MB.

3. **PostgreSQL connections**: Configured for `max_connections = 100`. The backend runs 4 Uvicorn workers, each maintaining a connection pool. Should be sufficient for 500 users, but monitor connection counts.

4. **Nginx**: 1024 `worker_connections` with `auto` workers (= CPU count). On a 4-core VPS, this handles 4096 simultaneous connections, more than enough.

### Vertical Scaling (Recommended First)

When approaching capacity on a 4-vCPU / 8-GB VPS:

| Upgrade to | Benefit |
|-----------|---------|
| 8 vCPU / 16 GB | Double the rendering capacity, more headroom for PostgreSQL and Hocuspocus |
| 8 vCPU / 32 GB | Comfortable for 500+ concurrent users with many active collaboration sessions |

Vertical scaling requires no code changes. Just resize the VPS, update `postgresql.conf` memory settings, and restart.

### Horizontal Scaling (If Vertical Limit Reached)

If a single VPS is no longer sufficient:

1. **Offload PostgreSQL**: Move to a managed database (e.g., DigitalOcean Managed PostgreSQL, AWS RDS). Removes DB resource contention from the application server. Change `DATABASE_URL` in `.env`.

2. **Offload Redis**: Move to managed Redis (e.g., DigitalOcean Managed Redis, AWS ElastiCache). Change `REDIS_URL` in `.env`.

3. **Scale PlantUML rendering**: Run multiple PlantUML server instances behind a load balancer within the Docker network, or increase its resource limits.

4. **Multiple application servers**: Requires a load balancer (e.g., Nginx on a separate node, or a cloud LB). The collaboration server is stateful (in-memory Yjs docs), so WebSocket connections must be sticky. This is a significant architectural change.

---

## Cost Estimate

### Monthly Costs

| Item | Low Estimate | High Estimate | Notes |
|------|-------------|--------------|-------|
| VPS (Hetzner CPX31) | $15 | $15 | 4 vCPU, 8 GB, 160 GB |
| VPS (DigitalOcean Premium) | $56 | $56 | 4 vCPU, 8 GB, 160 GB NVMe |
| Domain name | $1 | $2 | ~$12-24/year, amortized |
| TLS certificate | $0 | $0 | Let's Encrypt is free |
| S3 backup storage | $0.50 | $3 | 10-50 GB at Backblaze B2 rates |
| SMTP (transactional email) | $0 | $5 | Free tier covers low volume |
| Uptime monitoring | $0 | $0 | UptimeRobot free tier |
| **Total (Hetzner)** | **~$17** | **~$25** | |
| **Total (DigitalOcean)** | **~$58** | **~$66** | |

---

## Troubleshooting Guide

### Container Won't Start

```bash
# Check container logs
docker compose -f docker-compose.yml logs <service-name>

# Check container status and health
docker compose -f docker-compose.yml ps

# Common issues:
# - "port already in use": Another process is using port 80 or 443
sudo lsof -i :80
sudo lsof -i :443

# - Backend fails to start: DATABASE_URL is wrong or PostgreSQL isn't ready
docker compose -f docker-compose.yml logs backend | tail -20
```

### Database Connection Refused

```bash
# Check PostgreSQL is running
docker compose -f docker-compose.yml ps postgres
docker compose -f docker-compose.yml logs postgres | tail -20

# Check connection from backend container
docker compose -f docker-compose.yml exec backend python -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
async def check():
    e = create_async_engine('postgresql+asyncpg://plantuml:PASS@postgres:5432/plantuml')
    async with e.connect() as c:
        r = await c.execute(text('SELECT 1'))
        print('Connected:', r.scalar())
asyncio.run(check())
"
```

### TLS Certificate Issues

```bash
# Check certificate status
docker compose -f docker-compose.yml exec certbot certbot certificates

# Force renewal
docker compose -f docker-compose.yml exec certbot certbot renew --force-renewal

# Reload Nginx after renewal
docker exec plantuml-nginx nginx -s reload

# Check certificate from outside
echo | openssl s_client -connect app.example.com:443 -servername app.example.com 2>/dev/null | openssl x509 -noout -text | head -20
```

### WebSocket Connection Fails

```bash
# Check collaboration server health
docker compose -f docker-compose.yml logs collaboration | tail -20

# Test WebSocket from the VPS
# (requires wscat: npm install -g wscat)
wscat -c wss://app.example.com/collaboration

# Common issues:
# - Nginx not proxying WebSocket: Check Upgrade and Connection headers in nginx.conf
# - CORS: Check that PUBLIC_URL matches the domain users are connecting from
```

### PlantUML Renders Return 502

```bash
# Check PlantUML server health
docker compose -f docker-compose.yml exec plantuml curl -f http://localhost:8080/svg/SoWkIImgAStDuGe8zVLHqBLJ20eD

# Check PlantUML logs
docker compose -f docker-compose.yml logs plantuml | tail -20

# Common issues:
# - Out of memory: The PlantUML JVM hit its 1 GB limit
# - Timeout: Large or complex diagrams take too long to render
```

### Disk Space Full

```bash
# Check overall disk usage
df -h

# Check Docker's disk usage
docker system df

# Clean up unused Docker resources
docker system prune -f          # Remove stopped containers, unused networks, dangling images
docker image prune -a -f        # Remove all unused images (careful: will need rebuild)

# Check backup directory
du -sh /opt/plantuml-ide/backups/

# Check PostgreSQL WAL logs
docker compose -f docker-compose.yml exec postgres du -sh /var/lib/postgresql/data/pg_wal/
```

### Backend Returns 500 Errors

```bash
# Check backend logs (the global exception handler logs all unhandled exceptions)
docker compose -f docker-compose.yml logs backend | grep "Unhandled exception"

# Check detailed health
curl -s https://app.example.com/api/v1/health/detailed | python3 -m json.tool

# Restart the backend
docker compose -f docker-compose.yml restart backend
```

### Restore After Complete VPS Loss

If the VPS is destroyed and you need to redeploy from scratch:

1. Provision a new VPS (Step 1 and 2)
2. Configure DNS to point to the new VPS IP (Step 3)
3. Clone the repository and configure `.env` (Step 4) -- use the same secrets as before, especially `BACKUP_ENCRYPTION_KEY`
4. Obtain a new TLS certificate (Step 5)
5. Build the frontend and start services (Step 6 and 8)
6. Download and restore the latest backup from S3:
   ```bash
   aws s3 ls s3://plantuml-backups/ --endpoint-url https://s3.us-west-002.backblazeb2.com
   aws s3 cp s3://plantuml-backups/plantuml_LATEST.sql.zst.enc /opt/plantuml-ide/backups/ --endpoint-url ...
   cd /opt/plantuml-ide && source .env && ./scripts/restore.sh /opt/plantuml-ide/backups/plantuml_LATEST.sql.zst.enc
   ```
7. Verify everything works (Step 9)

---

## Appendix: Quick Reference Commands

```bash
# ─── Lifecycle ───
cd /opt/plantuml-ide
docker compose -f docker-compose.yml up -d                     # Start all services
docker compose -f docker-compose.yml down                       # Stop all services
docker compose -f docker-compose.yml restart <service>          # Restart one service
docker compose -f docker-compose.yml up -d --build <service>    # Rebuild and restart

# ─── Monitoring ───
docker compose -f docker-compose.yml ps                         # Container status
docker compose -f docker-compose.yml logs -f --tail 100         # Follow all logs
docker compose -f docker-compose.yml logs -f backend            # Follow backend logs
docker stats                                                    # Live resource usage

# ─── Database ───
docker compose -f docker-compose.yml exec backend alembic upgrade head                    # Run migrations
docker compose -f docker-compose.yml exec postgres psql -U plantuml -d plantuml           # PostgreSQL shell
docker compose -f docker-compose.yml exec postgres psql -U plantuml -d plantuml -c "\dt"  # List tables

# ─── Backup ───
source .env && BACKUP_DIR=/opt/plantuml-ide/backups ./scripts/backup.sh     # Manual backup
source .env && ./scripts/restore.sh /opt/plantuml-ide/backups/<file>        # Restore

# ─── TLS ───
docker compose -f docker-compose.yml exec certbot certbot certificates      # Check certs
docker exec plantuml-nginx nginx -s reload                                  # Reload Nginx

# ─── Debugging ───
docker compose -f docker-compose.yml exec backend python -c "from app.config import settings; print(settings.model_dump())"  # Check config
curl -s https://app.example.com/api/v1/health/detailed | python3 -m json.tool                                                  # Health check
```
