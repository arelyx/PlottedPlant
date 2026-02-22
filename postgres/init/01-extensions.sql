-- postgres/init/01-extensions.sql
-- Runs on first database creation only (docker-entrypoint-initdb.d)

-- Enable pgcrypto for gen_random_uuid() and digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;
