-- =====================================================================
-- Migration 0016: Stage 16 - Integrations Hub - Connections Table
-- =====================================================================
-- This migration creates the new unified connections table that replaces
-- and enhances the externalConnections table with support for:
-- - OAuth2 3-legged flow
-- - Multiple secret references
-- - Connection health tracking
-- - Enhanced metadata

-- Step 1: Create connection_type enum
DO $$ BEGIN
  CREATE TYPE connection_type AS ENUM (
    'api_key',
    'bearer',
    'oauth2_client_credentials',
    'oauth2_3leg'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 2: Create connections table
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type connection_type NOT NULL,
  base_url VARCHAR(500),

  -- Provider-specific configuration (tokenUrl, authUrl, scopes, etc.)
  auth_config JSONB DEFAULT '{}'::jsonb,

  -- References to secrets (e.g., { "apiKey": "secret-key-1", "clientId": "secret-key-2" })
  secret_refs JSONB DEFAULT '{}'::jsonb,

  -- OAuth2 3-legged flow state (access token, refresh token, expiry, scopes)
  -- Stored as: { "accessToken": "enc_...", "refreshToken": "enc_...", "expiresAt": 1234567890, "scopes": [...] }
  oauth_state JSONB,

  -- Connection configuration
  default_headers JSONB DEFAULT '{}'::jsonb,
  timeout_ms INTEGER DEFAULT 8000,
  retries INTEGER DEFAULT 2,
  backoff_ms INTEGER DEFAULT 250,

  -- Metadata
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_tested_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS connections_tenant_idx ON connections(tenant_id);
CREATE INDEX IF NOT EXISTS connections_project_idx ON connections(project_id);
CREATE INDEX IF NOT EXISTS connections_project_name_idx ON connections(project_id, name);
CREATE INDEX IF NOT EXISTS connections_type_idx ON connections(type);
CREATE INDEX IF NOT EXISTS connections_enabled_idx ON connections(enabled);
CREATE UNIQUE INDEX IF NOT EXISTS connections_project_name_unique_idx ON connections(project_id, name);

-- Step 4: Migrate data from external_connections to connections
-- Map old authType to new connection_type
INSERT INTO connections (
  tenant_id,
  project_id,
  name,
  type,
  base_url,
  secret_refs,
  default_headers,
  timeout_ms,
  retries,
  backoff_ms,
  created_at,
  updated_at
)
SELECT
  p.tenant_id,
  ec.project_id,
  ec.name,
  -- Map old authType to new connection_type enum
  CASE
    WHEN ec.auth_type = 'api_key' THEN 'api_key'::connection_type
    WHEN ec.auth_type = 'bearer' THEN 'bearer'::connection_type
    WHEN ec.auth_type = 'oauth2' THEN 'oauth2_client_credentials'::connection_type
    WHEN ec.auth_type = 'basic_auth' THEN 'api_key'::connection_type -- Map basic_auth to api_key for now
    ELSE 'api_key'::connection_type -- Default fallback
  END,
  ec.base_url,
  -- Create secret_refs JSON if secretId exists
  CASE
    WHEN ec.secret_id IS NOT NULL THEN jsonb_build_object('secretId', ec.secret_id::text)
    ELSE '{}'::jsonb
  END,
  ec.default_headers,
  ec.timeout_ms,
  ec.retries,
  ec.backoff_ms,
  ec.created_at,
  ec.updated_at
FROM external_connections ec
JOIN projects p ON ec.project_id = p.id
ON CONFLICT (project_id, name) DO NOTHING;

-- Step 5: Add comment for documentation
COMMENT ON TABLE connections IS 'Stage 16: Unified integration connection management with OAuth2 3-legged flow support';
COMMENT ON COLUMN connections.auth_config IS 'Provider-specific configuration: tokenUrl, authUrl, scopes, redirectUri, etc.';
COMMENT ON COLUMN connections.secret_refs IS 'References to secrets by key name, e.g., {"apiKey": "my_api_key", "clientSecret": "my_client_secret"}';
COMMENT ON COLUMN connections.oauth_state IS 'OAuth2 3-legged flow state: encrypted access/refresh tokens, expiry timestamp, granted scopes';

-- Note: external_connections table is kept for backward compatibility but marked as deprecated
-- New code should use the connections table
