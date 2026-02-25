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

### 1. Configure environment

Edit `.env` with production values:

- Set strong, unique secrets for `POSTGRES_PASSWORD`, `JWT_SECRET_KEY`, and `INTERNAL_SECRET`
- Set `PUBLIC_URL` and `PUBLIC_DOMAIN` to your actual domain
- Configure SMTP for transactional emails
- (Optional) Configure OAuth credentials for Google/GitHub login
- (Optional) Configure `BACKUP_*` variables for automated off-site backups

### 2. Build the frontend

```bash
docker compose run --rm frontend npm run build
```

This produces static files in `frontend/dist/` that Nginx serves directly in production.

### 3. Obtain TLS certificate

```bash
# First, start Nginx on port 80 for the ACME challenge
docker compose up -d nginx

# Issue the certificate
docker compose run --rm certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d your-domain.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email
```

Update the `ssl_certificate` and `ssl_certificate_key` paths in `nginx/nginx.conf` to match your domain.

### 4. Start all services

```bash
# Use only the production compose file (skip the dev override)
docker compose -f docker-compose.yml up -d
```

### 5. Run migrations and verify

```bash
docker compose run --rm backend alembic upgrade head
docker compose ps
curl -sf https://your-domain.com/api/v1/health
```

### 6. Set up automated certificate renewal

Add a cron job to reload Nginx daily (Certbot renews automatically via its container):

```cron
0 3 * * * cd /opt/plantuml-ide && docker compose exec nginx nginx -s reload > /dev/null 2>&1
```

### Updating a production deployment

```bash
cd /opt/plantuml-ide
git pull origin main
docker compose run --rm frontend npm run build      # if frontend changed
docker compose build backend collaboration          # rebuild images
docker compose run --rm backend alembic upgrade head # apply new migrations
docker compose up -d --no-deps backend collaboration nginx
docker compose ps
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
  nginx.conf             # Production config (HTTPS, CSP headers)
  nginx.dev.conf         # Development config (HTTP, proxy to Vite)

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
| `PUBLIC_DOMAIN` | - | Domain name (used in Nginx config) |
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
