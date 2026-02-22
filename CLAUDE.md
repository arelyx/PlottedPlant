# CLAUDE.md — PlantUML Collaborative IDE

## Project Overview

This is a web-based collaborative PlantUML IDE — think Overleaf but for PlantUML diagrams. Users create, edit, share, and collaborate on PlantUML diagrams through a browser-based interface with a Monaco code editor, live diagram preview, real-time multi-user collaboration via Yjs CRDTs, version history, and document sharing.

The target is 50-500 users on a single VPS. The architecture prioritizes simplicity and correctness over premature scalability.

## Specification Documents

Six specification documents govern this project. Read the relevant spec before making changes to any area of the codebase. They live in the repo root under `docs/`:

| Document | Governs |
|----------|---------|
| `plantuml-ide-requirements.md` | Product requirements, user roles, feature definitions, implementation order (Section 21 is critical — it defines the 9-step build sequence) |
| `plantuml-ide-database-schema.md` | All 13 PostgreSQL tables, indexes, TOAST configuration, content-addressable deduplication, permission-checking queries, Alembic migration ordering |
| `plantuml-ide-api-spec.md` | All REST endpoints — paths, methods, request/response shapes, status codes, permission requirements, rate limits |
| `plantuml-ide-frontend-spec.md` | React routes, page-level component trees, layout shells, shared components, state management, responsive breakpoints |
| `plantuml-ide-websocket-spec.md` | Hocuspocus lifecycle hooks, Yjs persistence strategy, debounce timing, awareness protocol, failure modes, internal command endpoints |
| `plantuml-ide-docker-spec.md` | Docker Compose services, networking, volumes, Nginx config, Dockerfiles, environment variables, backup scripts, deployment procedure |

When implementing a feature, cross-reference the relevant specs. They are internally consistent — the API spec references the schema's column names, the frontend spec references the API's response shapes, and the WebSocket spec references both.

## Architecture

```
Client (Browser) → Nginx (TLS, routing) → FastAPI (REST API)
                                        → Hocuspocus (WebSocket collaboration)
                                        
FastAPI → PostgreSQL (all persistent data)
       → Redis (render cache, rate limiting)
       → PlantUML Server (diagram rendering)
       → Hocuspocus command port (force-content, close-room)
       
Hocuspocus → FastAPI internal endpoints (auth validation, content load/persist)
```

Seven Docker containers. Two networks (`frontend_net` for public-facing traffic, `backend_net` marked `internal: true` for data-plane traffic). Only Nginx is exposed to the host.

**Hocuspocus never touches PostgreSQL directly.** All database access goes through FastAPI's `/api/v1/internal/*` endpoints. This keeps the ORM and migration logic in one codebase.

## Tech Stack

### Backend
- **Python 3.12+**, **FastAPI** (async), **SQLAlchemy 2.0** (async), **Alembic** for migrations
- **PostgreSQL 16** — single source of truth for all persistent data
- **Redis 7** — ephemeral render cache and rate limiting only (not a data store)
- **bcrypt** (via passlib) for password hashing, **PyJWT** for tokens, **Authlib** for OAuth

### Frontend
- **React 18+** with **TypeScript**, built with **Vite**
- **React Router v6**, **Zustand** for global state, **React Query** for server state
- **shadcn/ui** + **Tailwind CSS** for UI components
- **Monaco Editor** via `@monaco-editor/react`, PlantUML language via `@sinm/monaco-plantuml`
- **Yjs** + `y-monaco` + `@hocuspocus/provider` for real-time collaboration

### Collaboration Server
- **Node.js 20** + **TypeScript**, **Hocuspocus** (@hocuspocus/server)
- Small **Express/Fastify** HTTP server on port 1235 for internal commands from FastAPI

### Infrastructure
- **Docker Compose**, **Nginx** (reverse proxy + TLS), **Certbot** (Let's Encrypt)
- **PlantUML Server** (`plantuml/plantuml-server:jetty`) — internal only, never exposed

## Critical Design Decisions (Non-Obvious)

These are the decisions that are easy to get wrong if you don't know the context. Read this section before writing code.

### Database

1. **BIGINT identity PKs, not UUIDs.** All primary keys are `BIGINT GENERATED ALWAYS AS IDENTITY`. Faster inserts, smaller indexes, sequential locality. The schema spec explains the tradeoff.

2. **Content-addressable deduplication.** The `document_content` table is keyed by SHA-256 hash (`content_hash BYTEA PRIMARY KEY`). Version metadata rows in `document_versions` reference content by hash. Identical content is stored once regardless of how many versions reference it. When creating a version, always `INSERT INTO document_content ... ON CONFLICT DO NOTHING` before inserting the version metadata.

3. **`documents.current_content` is denormalized.** The current plain text lives directly on the `documents` row to avoid a JOIN for the most common operation (loading a document). It also has `current_content_hash` for fast change detection — hash the incoming content, compare to stored hash, skip the write if identical.

4. **`documents.version_counter`** is a per-document monotonic integer. To create a version: `UPDATE documents SET version_counter = version_counter + 1 ... RETURNING version_counter`, then use the returned value as the new version's `version_number`. This avoids gaps and race conditions.

5. **Version sources are an enum:** `auto`, `render`, `manual`, `restore`, `session_end`. Each source has a specific trigger — see the WebSocket spec Section 6.2 for the matrix. The Hocuspocus server only creates `auto` and `session_end` versions. The other sources come from REST API calls initiated by the frontend.

6. **No triggers, no stored procedures.** All logic lives in the application layer. The database is a dumb store with constraints and indexes.

7. **TOAST compression is LZ4** with `toast_tuple_target = 128` on content columns. This forces early out-of-line storage and keeps heap pages compact. Set via `ALTER TABLE ... SET (toast_tuple_target = 128)` after table creation.

8. **Case-insensitive uniqueness** on `email` and `username` uses functional indexes: `CREATE UNIQUE INDEX ... ON users (LOWER(email))`. The column stores the original case, but the index enforces uniqueness case-insensitively.

9. **Prefix search** for the sharing dialog uses `text_pattern_ops` indexes: `CREATE INDEX ... ON users (LOWER(username) text_pattern_ops)`. This enables efficient `LIKE 'prefix%'` queries without pg_trgm.

### Authentication & Security

10. **Tokens are never stored raw.** Refresh tokens and password reset tokens are SHA-256 hashed before storage. The raw token goes to the client; the hash goes to the database. A database breach doesn't expose usable tokens.

11. **Refresh tokens use rotation with reuse detection.** Each refresh creates a new token and revokes the old one via `replaced_by_id`. If a revoked token is presented, the entire token family for that user is invalidated (potential theft detected).

12. **Refresh tokens are HTTP-only secure cookies** (`SameSite=Strict`, `Path=/api/v1/auth`). Access tokens are returned in JSON response bodies and stored in memory by the frontend (not localStorage).

13. **404 over 403 for access control.** When a user requests a resource they have no access to, return `404` (not `403`) to prevent resource enumeration. Only return `403` when the user demonstrably has some access but tries an unauthorized action (e.g., viewer trying to edit).

14. **Internal endpoints authenticate via `X-Internal-Secret` header**, not JWT. These are only accessible within the Docker network — Nginx has a `deny all` rule for `/api/v1/internal/`.

### Collaboration & WebSocket

15. **Yjs state is ephemeral.** The Yjs CRDT binary state exists only in Hocuspocus memory while a document has active collaborators. When the last client disconnects, the Y.Doc is destroyed. Plain text in PostgreSQL is the durable representation. On next connect, `onLoadDocument` rebuilds the Y.Doc from the database.

16. **The Y.Text shared type name is `'monaco'`.** Both server (`document.getText('monaco')`) and client (y-monaco binding) must use this exact string. There is one shared text buffer per document, no sub-documents.

17. **Persistence debounce: 10 seconds quiet, 30 seconds hard cap.** `onStoreDocument` fires after 10 seconds of no Yjs updates, or every 30 seconds during continuous editing. The hash-comparison in `onStoreDocument` prevents no-op writes.

18. **Viewer write gating is server-side.** The `onChange` hook silently discards Yjs updates from connections with `is_readonly: true`. Client-side `readOnly` on Monaco is a UX convenience, not a security boundary.

19. **Two internal command endpoints on Hocuspocus (port 1235):**
    - `POST /internal/documents/{id}/force-content` — FastAPI pushes restored content into an active Y.Doc
    - `POST /internal/documents/{id}/close-room` — FastAPI force-disconnects all clients (document deleted)

20. **`is_session_ending` flag bridges `onDisconnect` and `onStoreDocument`.** When the last client disconnects, `onDisconnect` sets the flag, then `onStoreDocument` reads it to determine whether to call the `/session-end` endpoint vs `/sync`.

### Permission Model

21. **Three roles: owner, editor, viewer.** Permission is resolved as: owner (document creator) > direct document share > folder share. Folder shares apply to all documents within the folder.

22. **Permission check priority for documents:** (1) Is the user the document owner? → owner. (2) Does a `document_shares` row exist? → that permission. (3) Is the document in a folder with a `folder_shares` row? → that permission. (4) None of the above → no access (return 404).

23. **Version history is hidden from viewers.** Only owners and editors can see version history. Viewers see the current document only.

24. **Only owners can:** delete documents/folders, rename documents/folders, manage shares, revert to previous versions, move documents between folders.

## Workflow: Plan → Build → Validate → PR

Every implementation step follows a strict four-phase workflow. Do not skip phases.

### Phase 1: Plan

Before writing any code, produce a written plan. The plan should:

1. **Identify the scope.** Which implementation step (or sub-step) is being tackled? List every deliverable.
2. **Break it into tasks.** Decompose the step into ordered, granular tasks. Each task should be a single logical unit of work that maps to one or a few commits. Think about dependency order — what has to exist before something else can be built?
3. **Cross-reference the specs.** For each task, note which spec document and section governs it. If two specs are relevant (e.g., the API spec defines the endpoint shape and the schema spec defines the table), note both.
4. **Identify risks and unknowns.** Call out anything that might not work on the first try — package version conflicts, configuration that needs experimentation, integrations that need testing.

Write the plan out. Then execute it task by task.

### Phase 2: Build (Commit Often)

Work through the plan task by task. **Commit after every meaningful unit of progress.** Do not batch an entire step into one massive commit. Good commit cadence:

- Finished creating a new file or module → commit.
- Added a database migration → commit (migrations always get their own commit).
- Implemented an endpoint and its schema → commit.
- Added a frontend page or component → commit.
- Fixed something that wasn't working → commit.
- Added configuration or infrastructure → commit.

**Commit frequency guideline:** If you've been working for more than 10-15 minutes without committing, you've probably gone too long. Smaller, more frequent commits are always better than large, infrequent ones. They make review easier and rollbacks safer.

**Commit conventions:**
- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Include a scope: `feat(auth):`, `feat(db):`, `fix(frontend):`, `chore(infra):`.
- The message should say what changed and why, not how.
- One logical change per commit. Don't mix migrations with business logic. Don't mix backend and frontend in one commit unless they're tightly coupled (e.g., an API endpoint and the frontend call to it).

**Examples of good commit boundaries:**
```
chore(infra): add project directory structure and .gitignore
feat(db): add users and oauth_accounts migration
feat(auth): add registration endpoint with input validation
feat(auth): add login endpoint with JWT issuance
feat(auth): add refresh token rotation with reuse detection
feat(frontend): add login page with form validation
feat(frontend): add auth store and API client with token management
fix(auth): handle case-insensitive email uniqueness check
test(auth): add endpoint tests for registration and login
```

### Phase 3: Validate

Before opening a PR, verify that everything works. This means:

1. **The application starts cleanly.** Run `docker compose up -d` and confirm all containers reach healthy status with `docker compose ps`.
2. **No regressions.** If tests exist, run them and confirm they pass. If they don't exist yet (early steps), manually test the critical paths.
3. **The new functionality works.** Exercise the features you just built. Hit the endpoints with curl. Load the pages in a browser. Check that error cases return the right status codes.
4. **Logs are clean.** Check `docker compose logs backend` and `docker compose logs collaboration` for errors or warnings that shouldn't be there.
5. **Linting passes.** If linters are configured, run them. No code with lint errors should be pushed.

Fix any issues found during validation. Commit the fixes. Then proceed to the PR.

### Phase 4: Open a PR

After validation passes, push the branch and create a PR for review.

```bash
git push -u origin feature/step2-auth
gh pr create --title "feat(auth): Step 2 — Authentication system" --body "..."
```

**PR requirements:**

- **Reviewer:** Always assign `arelyx` as a reviewer on every PR using `--reviewer arelyx`.
- **Title:** Conventional commit format with the step number. e.g., `feat(auth): Step 2 — Authentication system`.
- **Description:** Must include:
  - A summary of what was implemented (reference spec sections).
  - A task list showing what's included.
  - Verification steps the reviewer can follow to confirm it works.
  - Any known limitations or deferred items.
- **One PR per implementation step.** Each of the 9 steps in the PRD gets its own PR. If a step is very large (e.g., Step 8 — Real-Time Collaboration), it can be split into multiple PRs, but each should be independently functional and mergeable.
- **Do not start the next step until the current PR is merged.** The reviewer (the project owner) will review the PR, possibly request changes, and merge it. Only then should you pull main and start the next step.

**PR description template:**
```markdown
## Summary
Implements Step N from the PRD (Section 21): [step name].

## What's Included
- [ ] Task 1 description
- [ ] Task 2 description
- [ ] Task 3 description
...

## Spec References
- PRD Section X — [what it covers]
- API Spec Section Y — [what it covers]
- Schema Spec Section Z — [what it covers]

## How to Verify
1. `docker compose up -d`
2. [specific curl commands or browser actions]
3. [expected results]

## Known Limitations
- [anything deferred to a later step]
```

### Branching

- `main` is the production branch. Never commit directly to main.
- Always pull the latest main before starting a new step: `git checkout main && git pull origin main`.
- Create feature branches from main: `feature/{step}-{short-description}` (e.g., `feature/step1-infrastructure`, `feature/step2-auth`, `feature/step4-monaco-editor`).
- For bug fixes: `fix/{short-description}`.
- For spec or doc changes: `docs/{short-description}`.

### Workflow Summary

```
Read specs → Write plan → Execute tasks (commit often) → Validate → Push → Open PR → Wait for merge → Pull main → Next step
```

## Implementation Order

Follow the 9-step order defined in the PRD Section 21. Each step builds on the previous one. Do not skip ahead.

1. **Infrastructure & Skeleton** — Docker Compose stack, FastAPI scaffold, React scaffold, Nginx routing
2. **Authentication** — Users table, registration, login, JWT, OAuth, frontend auth pages
3. **Document & Folder CRUD** — Core data model, REST endpoints, project browser UI
4. **Monaco Editor with Live Preview** — Split-pane editor, PlantUML rendering proxy, error markers
5. **Export & Templates** — Download formats, template library, theming, editor settings
6. **Autosave & Version History** — REST-based autosave, version creation, history UI, diff view, revert
7. **Sharing & Permissions** — User shares, folder shares, public links, permission enforcement on all endpoints
8. **Real-Time Collaboration** — Hocuspocus server, Yjs integration, remote cursors, migrate autosave to WebSocket
9. **Hardening & Deployment** — Security audit, rate limiting, backups, TLS, end-to-end smoke test

## Running the Application

```bash
# Development (first time)
cp .env.example .env
# Edit .env with your secrets

docker compose up -d
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend python -m app.scripts.seed_templates  # if available

# Access
# http://localhost          — Frontend (via Nginx → Vite dev server)
# http://localhost/api/v1   — Backend API (via Nginx → FastAPI)
# localhost:5432            — PostgreSQL (direct, dev only)
# localhost:6379            — Redis (direct, dev only)

# Logs
docker compose logs -f backend
docker compose logs -f collaboration

# Restart after code changes (backend auto-reloads, but if dependencies change):
docker compose up -d --build backend

# Run Alembic migration
docker compose run --rm backend alembic upgrade head

# Create a new migration
docker compose run --rm backend alembic revision --autogenerate -m "description"
```

## Testing

### Backend
```bash
docker compose run --rm backend pytest
docker compose run --rm backend pytest tests/test_auth.py -v
docker compose run --rm backend pytest --cov=app --cov-report=term-missing
```

- Use `pytest` with `httpx.AsyncClient` for FastAPI endpoint tests.
- Use a separate test database (create `plantuml_test` in the init script or use `--db-url` override).
- Every endpoint test must verify both the happy path and permission enforcement (e.g., viewer can't edit, non-owner can't delete).
- Test the content-addressable deduplication: creating two versions with identical content should result in one `document_content` row.

### Frontend
```bash
cd frontend
npm run test          # Vitest
npm run test:e2e      # Playwright (if set up)
```

### Collaboration Server
```bash
cd collaboration
npm run test          # Jest or Vitest
```

## Key File Locations

```
backend/app/main.py              — FastAPI app entry point
backend/app/config.py            — Pydantic Settings (reads env vars)
backend/app/routers/             — One file per API resource group
backend/app/routers/internal.py  — Endpoints called by Hocuspocus
backend/app/models/              — SQLAlchemy ORM models
backend/app/schemas/             — Pydantic request/response schemas
backend/alembic/versions/        — Database migrations

collaboration/src/index.ts       — Entry point (starts WS + HTTP servers)
collaboration/src/hooks/         — Hocuspocus lifecycle hook implementations
collaboration/src/commands/      — Internal HTTP command handlers (port 1235)

frontend/src/App.tsx             — Router setup
frontend/src/routes/             — Page components
frontend/src/components/         — Shared UI components
frontend/src/layouts/            — RootLayout, AuthLayout, AppLayout
frontend/src/stores/             — Zustand stores (auth, theme, preferences)
frontend/src/lib/                — API client, Yjs setup, utilities

nginx/nginx.conf                 — Production Nginx config
nginx/nginx.dev.conf             — Dev Nginx config

postgres/postgresql.conf         — PostgreSQL tuning
postgres/init/01-extensions.sql  — Extension installation (pgcrypto)
```

## Common Tasks

### Add a new API endpoint

1. Check the API spec for the exact path, method, request/response shape, and permission requirements.
2. Add the Pydantic schemas in `backend/app/schemas/`.
3. Add the route handler in the appropriate `backend/app/routers/` file.
4. Add permission checking — use the canonical query patterns from the database schema spec Section 4.
5. Write tests that cover happy path + unauthorized access.

### Add a new database table

1. Check the schema spec for the exact DDL, column types, constraints, and indexes.
2. Create the SQLAlchemy model in `backend/app/models/`.
3. Create an Alembic migration: `docker compose run --rm backend alembic revision --autogenerate -m "add table_name"`.
4. Review the generated migration — autogenerate misses functional indexes, partial indexes, TOAST settings, and autovacuum config. Add these manually.
5. Apply: `docker compose run --rm backend alembic upgrade head`.

### Add a new frontend page

1. Check the frontend spec for the route, layout, and component tree.
2. Create the page component in `frontend/src/routes/`.
3. Add the route to the router in `App.tsx`.
4. Use React Query for data fetching — check the frontend spec Section 7.2 for query keys and stale times.
5. Use the appropriate layout shell (AuthLayout for public pages, AppLayout for protected pages).

### Create a version (from backend code)

This is the content-addressable deduplication pattern. Always follow this exact sequence:

```python
import hashlib

content_bytes = content.encode('utf-8')
content_hash = hashlib.sha256(content_bytes).digest()

# 1. Skip if content hasn't changed
if document.current_content_hash == content_hash:
    return  # No-op

# 2. Insert content (deduplicated)
await db.execute(
    insert(DocumentContent)
    .values(content_hash=content_hash, content=content, byte_size=len(content_bytes))
    .on_conflict_do_nothing(index_elements=['content_hash'])
)

# 3. Bump version counter and update current content
result = await db.execute(
    update(Document)
    .where(Document.id == document_id)
    .values(
        current_content=content,
        current_content_hash=content_hash,
        version_counter=Document.version_counter + 1,
        updated_at=func.now(),
        last_edited_by=user_id,
    )
    .returning(Document.version_counter)
)
new_version_number = result.scalar_one()

# 4. Insert version metadata
await db.execute(
    insert(DocumentVersion).values(
        document_id=document_id,
        content_hash=content_hash,
        version_number=new_version_number,
        created_by=user_id,
        source=source,  # 'auto', 'render', 'manual', 'restore', 'session_end'
        label=label,     # None for auto-saves, user-provided for manual
    )
)

await db.commit()
```

## Guardrails

- **Never expose the PlantUML server to the public internet.** All rendering goes through the FastAPI backend proxy. The PlantUML server has `ALLOW_PLANTUML_INCLUDE=false` to prevent filesystem reads.
- **Never store raw tokens in the database.** Always SHA-256 hash before storage.
- **Never return 403 for resource-not-found.** Use 404 to prevent enumeration. Only use 403 when the user has proven partial access.
- **Never access PostgreSQL from the collaboration server.** All DB operations go through FastAPI's internal endpoints.
- **Never skip the content hash comparison before creating a version.** The deduplication saves 30-60% of writes.
- **Never use localStorage for access tokens.** Access tokens live in memory (Zustand store). Refresh tokens are HTTP-only cookies.
- **Never commit the `.env` file.** It contains secrets. Only `.env.example` is committed.
- **Never add Nginx routes for `/api/v1/internal/*`.** These are blocked with `deny all` in the Nginx config. They're only accessible within the Docker network.
