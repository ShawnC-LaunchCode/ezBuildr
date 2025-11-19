-- Add scope type enum
CREATE TYPE datavault_scope_type AS ENUM ('account', 'project', 'workflow');

-- Create datavault_databases table
CREATE TABLE IF NOT EXISTS datavault_databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  scope_type datavault_scope_type NOT NULL DEFAULT 'account',
  scope_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_scope CHECK (
    (scope_type = 'account' AND scope_id IS NULL) OR
    (scope_type = 'project' AND scope_id IS NOT NULL) OR
    (scope_type = 'workflow' AND scope_id IS NOT NULL)
  )
);

-- Add database_id column to datavault_tables
ALTER TABLE datavault_tables
ADD COLUMN database_id UUID REFERENCES datavault_databases(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX idx_databases_tenant ON datavault_databases(tenant_id);
CREATE INDEX idx_databases_scope ON datavault_databases(scope_type, scope_id) WHERE scope_id IS NOT NULL;
CREATE INDEX idx_tables_database ON datavault_tables(database_id, tenant_id);
CREATE INDEX idx_databases_updated ON datavault_databases(updated_at DESC);

-- Comments for documentation
COMMENT ON TABLE datavault_databases IS 'Database containers for organizing DataVault tables';
COMMENT ON COLUMN datavault_databases.scope_type IS 'Whether database is at account, project, or workflow level';
COMMENT ON COLUMN datavault_databases.scope_id IS 'Foreign key to projects.id or workflows.id depending on scope_type';
COMMENT ON COLUMN datavault_tables.database_id IS 'Optional parent database for this table';
