-- ============================================================
-- Public API Schema Migration
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Tenants table (registered API users)
CREATE TABLE IF NOT EXISTS tenants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text UNIQUE,
  sftp_host           text NOT NULL,
  sftp_user           text NOT NULL,
  sftp_password       text NOT NULL,
  sftp_port           int NOT NULL DEFAULT 22,
  sftp_domain         text NOT NULL,
  storage_used_bytes  bigint NOT NULL DEFAULT 0,
  storage_limit_bytes bigint NOT NULL DEFAULT 16106127360,  -- 15 GB
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 2. API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_hash    text UNIQUE NOT NULL,
  key_prefix  text NOT NULL,
  label       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Tenant users (sub-users under a tenant)
CREATE TABLE IF NOT EXISTS tenant_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email)
);

-- 4. Files metadata table
CREATE TABLE IF NOT EXISTS files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
  filename          text NOT NULL,
  original_filename text NOT NULL,
  public_url        text NOT NULL,
  size_bytes        bigint NOT NULL DEFAULT 0,
  mime_type         text NOT NULL,
  file_category     text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 5. Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action      text NOT NULL,
  resource    text,
  ip_address  text,
  error_code  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

-- Only look up active keys
CREATE INDEX IF NOT EXISTS idx_api_keys_hash
  ON api_keys (key_hash) WHERE is_active = true;

-- Fast user lookups by tenant
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant
  ON tenant_users (tenant_id);

-- Fast file lookups by tenant
CREATE INDEX IF NOT EXISTS idx_files_tenant
  ON files (tenant_id);

-- Fast file lookups by user
CREATE INDEX IF NOT EXISTS idx_files_user
  ON files (user_id);

-- Fast filtered queries: files by user + category
CREATE INDEX IF NOT EXISTS idx_files_user_category
  ON files (user_id, file_category);

-- Fast filtered queries: files by tenant + category
CREATE INDEX IF NOT EXISTS idx_files_tenant_category
  ON files (tenant_id, file_category);

-- Fast sorted queries: files by tenant + creation date
CREATE INDEX IF NOT EXISTS idx_files_tenant_created
  ON files (tenant_id, created_at DESC);

-- Fast audit log lookups
CREATE INDEX IF NOT EXISTS idx_audit_tenant
  ON audit_logs (tenant_id, created_at DESC);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
-- We use the Supabase service-role key on the backend,
-- so RLS is bypassed. Enable it to protect against
-- accidental direct client access.

ALTER TABLE tenants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users  ENABLE ROW LEVEL SECURITY;
ALTER TABLE files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs    ENABLE ROW LEVEL SECURITY;

-- Service-role key bypasses RLS automatically.
-- No additional policies needed for server-side access.

-- ============================================================
-- RPC Functions
-- ============================================================

-- Atomically increment (or decrement) a tenant's storage_used_bytes.
-- Pass negative p_bytes to decrement (e.g. after file deletion).
CREATE OR REPLACE FUNCTION increment_storage(p_tenant_id uuid, p_bytes bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tenants
  SET storage_used_bytes = GREATEST(0, storage_used_bytes + p_bytes)
  WHERE id = p_tenant_id;
END;
$$;
