-- Migration: Add Organization Ownership Model
-- Description: Adds organizations as first-class collaboration units with ownership support
-- Date: 2026-01-04

-- ====================================
-- 1. Add placeholder user support
-- ====================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS placeholder_email VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_users_is_placeholder ON users(is_placeholder);
CREATE INDEX IF NOT EXISTS idx_users_placeholder_email ON users(placeholder_email);

-- ====================================
-- 2. Modify organizations table
-- ====================================

-- Add created_by field
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add description field
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT;

-- Make slug nullable for non-enterprise orgs
ALTER TABLE organizations ALTER COLUMN slug DROP NOT NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by_user_id);

-- ====================================
-- 3. Create organization_memberships table
-- ====================================

CREATE TABLE IF NOT EXISTS organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON organization_memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_role ON organization_memberships(role);

-- ====================================
-- 4. Create organization_invites table
-- ====================================

CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_email VARCHAR(255) NOT NULL,
  invited_user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  invited_by_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invites_token ON organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_org_invites_org_email_status ON organization_invites(org_id, invited_email, status);
CREATE INDEX IF NOT EXISTS idx_org_invites_status ON organization_invites(status);
CREATE INDEX IF NOT EXISTS idx_org_invites_expires ON organization_invites(expires_at);

-- ====================================
-- 5. Add ownership to projects
-- ====================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_type VARCHAR(50) CHECK (owner_type IN ('user', 'org'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_uuid UUID;

-- Create indexes for ownership queries
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_type, owner_uuid);

-- Backfill existing projects with user ownership
UPDATE projects
SET owner_type = 'user', owner_uuid = owner_id::uuid
WHERE owner_type IS NULL AND owner_id IS NOT NULL;

-- ====================================
-- 6. Add ownership to workflows
-- ====================================

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS owner_type VARCHAR(50) CHECK (owner_type IN ('user', 'org'));
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS owner_uuid UUID;

-- Create indexes for ownership queries
CREATE INDEX IF NOT EXISTS idx_workflows_owner ON workflows(owner_type, owner_uuid);

-- Backfill existing workflows with user ownership
UPDATE workflows
SET owner_type = 'user', owner_uuid = owner_id::uuid
WHERE owner_type IS NULL AND owner_id IS NOT NULL;

-- ====================================
-- 7. Add ownership to datavault_databases
-- ====================================

ALTER TABLE datavault_databases ADD COLUMN IF NOT EXISTS owner_type VARCHAR(50) CHECK (owner_type IN ('user', 'org'));
ALTER TABLE datavault_databases ADD COLUMN IF NOT EXISTS owner_uuid UUID;

-- Create indexes for ownership queries
CREATE INDEX IF NOT EXISTS idx_datavault_databases_owner ON datavault_databases(owner_type, owner_uuid);

-- Backfill existing databases with user ownership based on scope
-- If scope_type is 'account', use the tenant's primary user or leave null for now
-- This is a conservative approach - admin can backfill manually if needed
UPDATE datavault_databases
SET owner_type = 'user', owner_uuid = scope_id
WHERE owner_type IS NULL
  AND scope_type = 'project'
  AND scope_id IS NOT NULL;

-- ====================================
-- 8. Add comments for documentation
-- ====================================

COMMENT ON TABLE organization_memberships IS 'Direct organization membership with admin/member roles';
COMMENT ON TABLE organization_invites IS 'Pending organization invitations with 7-day expiry';
COMMENT ON COLUMN users.is_placeholder IS 'True if user was created as placeholder for invite';
COMMENT ON COLUMN users.placeholder_email IS 'Email used for placeholder user creation';
COMMENT ON COLUMN organizations.created_by_user_id IS 'User who created this organization';
COMMENT ON COLUMN projects.owner_type IS 'Owner type: user or org';
COMMENT ON COLUMN projects.owner_uuid IS 'UUID of the owning user or organization';
COMMENT ON COLUMN workflows.owner_type IS 'Owner type: user or org';
COMMENT ON COLUMN workflows.owner_uuid IS 'UUID of the owning user or organization';
COMMENT ON COLUMN datavault_databases.owner_type IS 'Owner type: user or org';
COMMENT ON COLUMN datavault_databases.owner_uuid IS 'UUID of the owning user or organization';
