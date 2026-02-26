# PlottedPlant

A web-based collaborative PlantUML editor. Create, edit, share, and collaborate on PlantUML diagrams through a browser-based interface with a Monaco code editor, live diagram preview, real-time multi-user collaboration, version history, and document sharing.

## Architecture

```
Browser  -->  Nginx (reverse proxy / TLS)  -->  FastAPI   (REST API)
                                           -->  Hocuspocus (WebSocket collaboration)

FastAPI  -->  PostgreSQL  (persistent data)
         -->  Redis       (render cache, rate limiting)
         -->  PlantUML    (diagram rendering)
         -->  Hocuspocus  (force-content, close-room commands)

Hocuspocus  -->  FastAPI internal endpoints  (auth, content load/persist)
```

Seven Docker containers across two networks:

| Container | Role | Port (internal) |
|-----------|------|-----------------|
| **nginx** | Reverse proxy, TLS termination, static file serving | 80, 443 (exposed to host) |
| **backend** | FastAPI REST API | 8000 |
| **collaboration** | Hocuspocus WebSocket server + internal command HTTP | 1234 (WS), 1235 (commands) |
| **plantuml** | PlantUML rendering engine (Jetty) | 8080 |
| **postgres** | PostgreSQL 16 database | 5432 |
| **redis** | Render cache and rate limiting | 6379 |
| **certbot** | TLS certificate renewal (production only) | - |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) (v2+)
- [Git](https://git-scm.com/)
- (Production only) A domain name pointed at your server for TLS

## Quick Start (Development)

### 1. Clone and configure

```bash
git clone https://github.com/arelyx/PlottedPlant.git
cd PlottedPlant
cp .env.example .env
```

Edit `.env` and set the required secrets. At minimum, generate real values for:

```bash
# Generate secrets (run each, paste into .env)
openssl rand -hex 32   # POSTGRES_PASSWORD
openssl rand -hex 64   # JWT_SECRET_KEY
openssl rand -hex 32   # INTERNAL_SECRET
```

OAuth and SMTP are optional for local development.

### 2. Start all services

```bash
docker compose up -d
```

This starts all 7 containers (6 core + the Vite dev server via the override file). The first build takes a few minutes to download images and install dependencies.

### 3. Run database migrations

```bash
docker compose run --rm backend alembic upgrade head
```

### 4. Verify everything is running

```bash
docker compose ps
```

All containers should show `healthy` status. If any are still starting, wait a moment and check again.

### 5. Access the application

| URL | Description |
|-----|-------------|
| http://localhost | Frontend (Nginx proxies to Vite dev server) |
| http://localhost/api/v1/docs | API documentation (Swagger UI) |
| http://localhost/api/v1/health | Backend health check |

### Development features

The `docker-compose.override.yml` file is automatically applied in development and provides:

- **Hot module replacement** for the frontend (Vite dev server with HMR)
- **Auto-reload** for the backend (uvicorn `--reload`)
- **Debug logging** for backend and collaboration server
- **Direct database access** on `localhost:5432`
- **Direct Redis access** on `localhost:6379`
- **Swagger UI** at `/api/v1/docs` and ReDoc at `/api/v1/redoc`
- **No Certbot** (TLS is not used in development)

Source code is volume-mounted, so changes to backend Python files and frontend `src/` are reflected immediately without rebuilding.

## Stopping the Application

```bash
# Stop all containers (preserves data)
docker compose down

# Stop and remove all data volumes (full reset)
docker compose down -v
```

## Restarting After Code Changes

Most changes are picked up automatically via hot-reload. If you modify dependencies or Dockerfiles:

```bash
# Rebuild a specific service
docker compose up -d --build backend

# Rebuild everything
docker compose up -d --build
```

## Database Operations

```bash
# Run pending migrations
docker compose run --rm backend alembic upgrade head

# Create a new migration after model changes
docker compose run --rm backend alembic revision --autogenerate -m "description of change"

# Check current migration state
docker compose run --rm backend alembic current

# Seed templates (if the script exists)
docker compose run --rm backend python -m app.scripts.seed_templates
```

## Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f collaboration
docker compose logs -f nginx

# Last N lines
docker compose logs --tail=50 backend
```

## Production Deployment

> **Dev vs Production:** Development uses `docker compose up` which auto-merges
> `docker-compose.override.yml` (Vite HMR, hot-reload, HTTP only). Production
> uses `docker compose -f docker-compose.yml up` to skip the dev override and
> serve pre-built static files behind TLS.

### 1. Install Docker

Install Docker Engine and the Compose plugin from the official repository (not your
distro's package manager) to get the latest version:

```bash
# Ubuntu/Debian — see https://docs.docker.com/engine/install/ for other distros
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc > /dev/null
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with production values:

```bash
# Generate secrets (run each, paste into .env)
openssl rand -base64 32   # → POSTGRES_PASSWORD
openssl rand -hex 64      # → JWT_SECRET_KEY
openssl rand -hex 32      # → INTERNAL_SECRET
```

Set the domain and URL:

```env
PUBLIC_URL=https://yourdomain.com
PUBLIC_DOMAIN=yourdomain.com
```

`PUBLIC_DOMAIN` is used at container startup — `nginx/nginx.conf` contains `${PUBLIC_DOMAIN}` placeholders that are resolved via `envsubst` when the nginx container starts. You do **not** need to edit nginx.conf manually.

Also configure:
- SMTP credentials for transactional emails
- (Optional) OAuth credentials for Google/GitHub login
- (Optional) `BACKUP_*` variables for automated off-site backups

### 3. Build the frontend

The production compose file serves pre-built static files from `frontend/dist/`.
Build them with Docker so you don't need Node installed on the host:

```bash
# Build and extract static assets
docker build \
  --build-arg VITE_API_BASE_URL=https://yourdomain.com/api/v1 \
  --build-arg VITE_WS_BASE_URL=wss://yourdomain.com/collaboration \
  --build-arg VITE_PUBLIC_URL=https://yourdomain.com \
  -t plantuml-frontend-build \
  -f frontend/Dockerfile frontend/

# Extract the dist/ directory from the build image
CID=$(docker create --entrypoint="" plantuml-frontend-build /bin/true)
docker cp "$CID":/dist frontend/dist
docker rm "$CID"
```

### 4. Obtain TLS certificate

DNS must already point your domain (and optionally `www.`) at the server.

```bash
# Start a temporary nginx to serve the ACME challenge
docker run -d --name certbot-nginx \
  -p 80:80 \
  -v ./nginx/nginx.dev.conf:/etc/nginx/nginx.conf:ro \
  -v plantuml_certbot_webroot:/var/www/certbot \
  nginx:1.28.2-alpine

# Request the certificate
docker run --rm \
  -v plantuml_certbot_certs:/etc/letsencrypt \
  -v plantuml_certbot_webroot:/var/www/certbot \
  certbot/certbot:latest certonly \
    --webroot -w /var/www/certbot \
    -d yourdomain.com -d www.yourdomain.com \
    --non-interactive --agree-tos \
    --email you@yourdomain.com

# Remove the temporary nginx
docker rm -f certbot-nginx
```

The certificate and key are stored in the `plantuml_certbot_certs` Docker volume,
which the production nginx container mounts at `/etc/letsencrypt`. The paths in
nginx.conf (`/etc/letsencrypt/live/${PUBLIC_DOMAIN}/...`) will resolve correctly
as long as `PUBLIC_DOMAIN` in `.env` matches the domain you requested the cert for.

### 5. Start all services

```bash
# Production only — explicitly exclude the dev override
docker compose -f docker-compose.yml up -d --build
```

### 6. Run migrations and seed data

```bash
docker compose -f docker-compose.yml exec backend alembic upgrade head
docker compose -f docker-compose.yml exec backend python -m app.scripts.seed_templates
```

### 7. Verify

```bash
docker compose -f docker-compose.yml ps                         # all containers healthy
curl -sk https://yourdomain.com/health                          # → ok
curl -sk https://yourdomain.com/api/v1/health                   # → {"status":"healthy",...}
curl -sk -o /dev/null -w "%{http_code}" http://yourdomain.com/  # → 301 (HTTP→HTTPS)
curl -sk -o /dev/null -w "%{http_code}" https://www.yourdomain.com/  # → 301 (www→non-www)
```

### Certificate renewal

The `certbot` container runs a renewal loop (checks every 12 hours). To pick up
renewed certificates, reload nginx periodically with a cron job:

```cron
0 3 * * * cd /path/to/PlottedPlant && docker compose -f docker-compose.yml exec nginx nginx -s reload > /dev/null 2>&1
```

### Updating a production deployment

```bash
cd /path/to/PlottedPlant
git pull origin main

# Rebuild frontend if frontend/ changed
docker build \
  --build-arg VITE_API_BASE_URL=https://yourdomain.com/api/v1 \
  --build-arg VITE_WS_BASE_URL=wss://yourdomain.com/collaboration \
  --build-arg VITE_PUBLIC_URL=https://yourdomain.com \
  -t plantuml-frontend-build -f frontend/Dockerfile frontend/
CID=$(docker create --entrypoint="" plantuml-frontend-build /bin/true)
docker cp "$CID":/dist frontend/dist && docker rm "$CID"

# Rebuild backend/collaboration images and apply migrations
docker compose -f docker-compose.yml build backend collaboration
docker compose -f docker-compose.yml exec backend alembic upgrade head
docker compose -f docker-compose.yml up -d --no-deps backend collaboration nginx
docker compose -f docker-compose.yml ps
```

## Backup and Restore

### Automated backups

The `scripts/backup.sh` script performs:

1. `pg_dump` of the PostgreSQL database
2. `zstd` compression
3. (Optional) AES-256-CBC encryption if `BACKUP_ENCRYPTION_KEY` is set
4. (Optional) Upload to S3-compatible storage if `BACKUP_S3_BUCKET` is set
5. Prunes local backups older than 7 days

Set up a cron job to run every 6 hours:

```cron
0 */6 * * * cd /opt/plantuml-ide && ./scripts/backup.sh >> /var/log/plantuml-backup.log 2>&1
```

Required environment variables (from `.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_USER` | Yes | Database user |
| `POSTGRES_DB` | Yes | Database name |
| `BACKUP_ENCRYPTION_KEY` | No | AES-256 encryption passphrase |
| `BACKUP_S3_BUCKET` | No | S3 bucket name |
| `BACKUP_S3_ENDPOINT` | No | S3-compatible endpoint URL |

### Restoring from a backup

```bash
# Unencrypted backup
./scripts/restore.sh /backups/plantuml_20260101_120000.sql.zst

# Encrypted backup (requires BACKUP_ENCRYPTION_KEY in environment)
./scripts/restore.sh /backups/plantuml_20260101_120000.sql.zst.enc
```

The restore script will prompt for confirmation, stop application services, restore the database, run migrations, and restart services.

## Project Structure

```
backend/
  app/
    main.py              # FastAPI entry point
    config.py            # Settings (reads environment variables)
    routers/             # API route handlers (one file per resource)
    models/              # SQLAlchemy ORM models
    schemas/             # Pydantic request/response schemas
    middleware/           # Rate limiting middleware
    services/            # Business logic (document, collaboration)
    dependencies.py      # Shared FastAPI dependencies
  alembic/
    versions/            # Database migration scripts

collaboration/
  src/
    index.ts             # Hocuspocus server + Express command endpoints
    hooks/               # Lifecycle hooks (auth, load, store, disconnect, etc.)
    utils/               # HTTP client, logger, hashing

frontend/
  src/
    App.tsx              # React Router setup
    routes/              # Page components
    components/          # Shared UI components
    layouts/             # RootLayout, AuthLayout, AppLayout
    stores/              # Zustand stores (auth, theme, preferences)
    lib/                 # API client, collaboration session, utilities

nginx/
  nginx.conf             # Production template — ${PUBLIC_DOMAIN} resolved by envsubst at startup
  nginx.dev.conf         # Development config (HTTP only, proxy to Vite dev server)

postgres/
  postgresql.conf        # PostgreSQL tuning
  init/                  # Initialization scripts (extensions)

scripts/
  backup.sh              # Automated database backup
  restore.sh             # Database restore from backup

docs/                    # Specification documents
```

## Environment Variables

All configuration is via environment variables, loaded from `.env` by Docker Compose. See `.env.example` for the full list with descriptions.

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `plantuml` | PostgreSQL username |
| `POSTGRES_PASSWORD` | - | PostgreSQL password |
| `POSTGRES_DB` | `plantuml` | PostgreSQL database name |
| `JWT_SECRET_KEY` | - | Secret for signing JWT access tokens |
| `INTERNAL_SECRET` | - | Shared secret for backend-collaboration communication |
| `PUBLIC_URL` | - | Public-facing URL (e.g., `https://app.example.com`) |
| `PUBLIC_DOMAIN` | - | Domain name — used by nginx.conf template for server_name and TLS cert paths |
| `CORS_ORIGINS` | `${PUBLIC_URL}` | Comma-separated allowed CORS origins |
| `SMTP_HOST` | - | SMTP server for transactional emails |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_FROM_EMAIL` | - | Sender email address |
| `OAUTH_GOOGLE_CLIENT_ID` | - | Google OAuth client ID (optional) |
| `OAUTH_GITHUB_CLIENT_ID` | - | GitHub OAuth client ID (optional) |

## Troubleshooting

### Containers not starting

```bash
# Check which containers are unhealthy
docker compose ps

# View startup logs for the failing service
docker compose logs backend
docker compose logs collaboration
```

### Database connection errors

Ensure PostgreSQL is healthy before the backend starts. The compose file handles this via `depends_on` with health checks, but if you see connection errors:

```bash
# Check PostgreSQL is running and accepting connections
docker compose exec postgres pg_isready -U plantuml

# Verify migrations have been run
docker compose run --rm backend alembic current
```

### Port conflicts

If port 80 or 443 is already in use:

```bash
# Find what's using the port
lsof -i :80

# Or change the port mapping in docker-compose.override.yml
# ports:
#   - "8080:80"
```

### Full reset

To start completely fresh, removing all data:

```bash
docker compose down -v
docker compose up -d
docker compose run --rm backend alembic upgrade head
```
