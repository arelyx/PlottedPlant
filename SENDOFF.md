# PlottedPlant — Server Migration Sendoff

Current state of the project and what needs to be done on the new server.

---

## Current Branch: `feat/oauth-login`

OAuth login (GitHub + Google) is fully implemented but **untested** because it needs OAuth app credentials configured. The code is committed locally but not yet pushed.

### Unpushed commits on `feat/oauth-login`:
1. `feat(auth): add OAuth router with GitHub and Google authorization flows`
2. `feat(frontend): add OAuth login buttons and callback page`

**Push this branch before nuking the VM:**
```bash
git push -u origin feat/oauth-login
```

---

## Open PR (stale): `feat/email-resend` — PR #46

Email verification and password reset via Resend. Code is complete and tested with Resend's test domain. Blocked on Resend domain verification for `plottedplant.com`.

**Status:** Can be merged once the domain is verified on https://resend.com/domains. Zero code changes needed — just DNS propagation.

---

## OAuth Setup (to complete on new server)

### 1. GitHub OAuth App

1. Go to https://github.com/settings/applications/new
2. Fill in:
   - **Application name:** PlottedPlant
   - **Homepage URL:** `https://plottedplant.com`
   - **Authorization callback URL:** `https://plottedplant.com/api/v1/auth/oauth/github/callback`
3. Click **Register application**
4. Copy the **Client ID**
5. Click **Generate a new client secret**, copy it

Add to `.env`:
```
OAUTH_GITHUB_CLIENT_ID=<your-client-id>
OAUTH_GITHUB_CLIENT_SECRET=<your-client-secret>
```

### 2. Google OAuth App (optional)

1. Go to https://console.cloud.google.com/apis/credentials
2. Click **Create Credentials** > **OAuth client ID**
3. Application type: **Web application**
4. Name: PlottedPlant
5. Authorized redirect URIs: `https://plottedplant.com/api/v1/auth/oauth/google/callback`
6. Copy **Client ID** and **Client Secret**

Add to `.env`:
```
OAUTH_GOOGLE_CLIENT_ID=<your-client-id>
OAUTH_GOOGLE_CLIENT_SECRET=<your-client-secret>
```

### 3. After configuring credentials

```bash
# Rebuild and restart backend
docker compose -f docker-compose.yml build backend
docker compose -f docker-compose.yml up -d backend

# Test: should redirect to GitHub
curl -v https://plottedplant.com/api/v1/auth/oauth/github/authorize
```

---

## Full Deployment Checklist (new server)

### Prerequisites
- Docker Engine (install from https://docs.docker.com/engine/install/, NOT apt)
- Git, curl

### Steps

```bash
# 1. Clone
git clone git@github.com:arelyx/PlottedPlant.git
cd PlottedPlant

# 2. Checkout the OAuth branch (or main if merged)
git checkout feat/oauth-login

# 3. Create .env from template
cp .env.example .env
# Edit .env — fill in all secrets:
#   POSTGRES_PASSWORD  (openssl rand -base64 32)
#   JWT_SECRET_KEY     (openssl rand -hex 64)
#   INTERNAL_SECRET    (openssl rand -hex 32)
#   PUBLIC_URL         = https://plottedplant.com
#   PUBLIC_DOMAIN      = plottedplant.com
#   OAUTH_GITHUB_CLIENT_ID / SECRET
#   OAUTH_GOOGLE_CLIENT_ID / SECRET (optional)

# 4. Get TLS certificate (before starting the full stack)
#    Start a temporary nginx for the ACME challenge:
docker run -d --name tmp-nginx -p 80:80 \
  -v $(pwd)/nginx/nginx.dev.conf:/etc/nginx/nginx.conf:ro \
  nginx:alpine
certbot certonly --webroot -w /var/www/certbot \
  -d plottedplant.com -d www.plottedplant.com \
  --non-interactive --agree-tos -m your@email.com
docker rm -f tmp-nginx
#    Or if certs already exist, copy /etc/letsencrypt into the certbot_certs volume.

# 5. Build frontend
cd frontend
docker build -t plantuml-frontend-build -f Dockerfile .
rm -rf dist
TEMP_ID=$(docker create --entrypoint="" plantuml-frontend-build /bin/true)
docker cp "$TEMP_ID":/dist dist
docker rm "$TEMP_ID"
cd ..

# 6. Start the stack
docker compose -f docker-compose.yml up -d

# 7. Run migrations
docker compose -f docker-compose.yml run --rm backend alembic upgrade head

# 8. Seed templates
docker compose -f docker-compose.yml run --rm backend python -m app.scripts.seed_templates

# 9. Verify
docker compose -f docker-compose.yml ps   # all healthy
curl https://plottedplant.com/api/v1/health
```

### DNS Records (if changing server IP)

Update A record for `plottedplant.com` and `www.plottedplant.com` to the new server IP.

If you set up Resend email (PR #46), also update the SPF record with the new IP:
```
v=spf1 ip4:<NEW_IP> -all
```

---

## Project Structure Reminder

- `docker-compose.yml` — production (use `-f docker-compose.yml` explicitly)
- `docker-compose.override.yml` — dev overrides (auto-merged with plain `docker compose up`)
- `.env` — secrets (gitignored, never committed)
- `nginx/nginx.conf` — production template (uses `${PUBLIC_DOMAIN}` via envsubst)
- `nginx/nginx.dev.conf` — dev config (HTTP only, no TLS)

## Key Ports
- 80, 443 — Nginx (only ports exposed to host)
- 8000 — Backend (internal)
- 1234 — Hocuspocus WebSocket (internal)
- 1235 — Hocuspocus command port (internal)
- 5432 — PostgreSQL (internal, exposed in dev only)
- 6379 — Redis (internal, exposed in dev only)
