-- Migration: Add DataVault API Tokens Table
-- Description: Enable external systems to read/write DataVault databases via API tokens
-- Version: 0042
-- Date: 2025-11-20

-- Create datavault_api_tokens table
CREATE TABLE IF NOT EXISTS datavault_api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    database_id UUID NOT NULL REFERENCES datavault_databases(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,

    -- Ensure unique token hashes
    CONSTRAINT unique_token_hash UNIQUE (token_hash)
);

-- Create indexes for performance
CREATE INDEX idx_datavault_api_tokens_database_id ON datavault_api_tokens(database_id);
CREATE INDEX idx_datavault_api_tokens_tenant_id ON datavault_api_tokens(tenant_id);
CREATE INDEX idx_datavault_api_tokens_token_hash ON datavault_api_tokens(token_hash);
CREATE INDEX idx_datavault_api_tokens_expires_at ON datavault_api_tokens(expires_at) WHERE expires_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE datavault_api_tokens IS 'API tokens for external access to DataVault databases';
COMMENT ON COLUMN datavault_api_tokens.id IS 'Unique identifier for the API token';
COMMENT ON COLUMN datavault_api_tokens.database_id IS 'Reference to the DataVault database this token grants access to';
COMMENT ON COLUMN datavault_api_tokens.tenant_id IS 'Reference to the tenant that owns this token';
COMMENT ON COLUMN datavault_api_tokens.label IS 'Human-readable label for the token';
COMMENT ON COLUMN datavault_api_tokens.token_hash IS 'SHA-256 hash of the actual token (never store plain tokens)';
COMMENT ON COLUMN datavault_api_tokens.scopes IS 'Array of permission scopes (e.g., read, write)';
COMMENT ON COLUMN datavault_api_tokens.created_at IS 'Timestamp when the token was created';
COMMENT ON COLUMN datavault_api_tokens.expires_at IS 'Optional expiration timestamp for the token';
