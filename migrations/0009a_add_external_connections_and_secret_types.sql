-- Migration: Add External Connections table and secret types
-- Date: 2025-11-12
-- Description: Stage 9 - HTTP/Fetch Node + Secrets UI

-- Add secret type enum
CREATE TYPE secret_type AS ENUM ('api_key', 'bearer', 'oauth2', 'basic_auth');

-- Add type column to existing secrets table
ALTER TABLE secrets ADD COLUMN IF NOT EXISTS type secret_type DEFAULT 'api_key' NOT NULL;

-- Add metadata column for additional secret configuration (e.g., OAuth2 token URL, scope)
ALTER TABLE secrets ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Create external_connections table for reusable API connection configs
CREATE TABLE IF NOT EXISTS external_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  base_url VARCHAR(500) NOT NULL,
  auth_type VARCHAR(50) NOT NULL, -- 'api_key' | 'bearer' | 'oauth2' | 'basic_auth' | 'none'
  secret_id UUID REFERENCES secrets(id) ON DELETE SET NULL, -- Primary secret for auth
  default_headers JSONB DEFAULT '{}'::jsonb,
  timeout_ms INTEGER DEFAULT 8000,
  retries INTEGER DEFAULT 2,
  backoff_ms INTEGER DEFAULT 250,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add unique constraint on (project_id, name) for external_connections
CREATE UNIQUE INDEX IF NOT EXISTS external_connections_project_name_idx
  ON external_connections(project_id, name);

-- Add indices for performance
CREATE INDEX IF NOT EXISTS external_connections_project_idx ON external_connections(project_id);
CREATE INDEX IF NOT EXISTS external_connections_secret_idx ON external_connections(secret_id);
CREATE INDEX IF NOT EXISTS secrets_type_idx ON secrets(type);

-- Add unique constraint on (project_id, key) for secrets
CREATE UNIQUE INDEX IF NOT EXISTS secrets_project_key_idx ON secrets(project_id, key);

-- Update existing secrets to have default metadata
UPDATE secrets SET metadata = '{}'::jsonb WHERE metadata IS NULL;

COMMENT ON TABLE external_connections IS 'Reusable API connection configurations for HTTP nodes';
COMMENT ON TABLE secrets IS 'Encrypted secrets (API keys, tokens, OAuth2 credentials) with KMS-backed encryption';
COMMENT ON COLUMN secrets.value_enc IS 'Encrypted value using envelope encryption with master key';
COMMENT ON COLUMN secrets.type IS 'Type of secret: api_key, bearer, oauth2, basic_auth';
COMMENT ON COLUMN secrets.metadata IS 'Additional configuration (e.g., OAuth2 tokenUrl, clientId reference, scope)';
COMMENT ON COLUMN external_connections.auth_type IS 'Authentication type: api_key, bearer, oauth2, basic_auth, none';
COMMENT ON COLUMN external_connections.default_headers IS 'Default headers applied to all requests using this connection';
