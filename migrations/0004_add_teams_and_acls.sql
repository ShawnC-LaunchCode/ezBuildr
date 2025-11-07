-- Migration: Add Teams & Sharing Foundations (Epic 4)
-- This migration adds:
--   1. ownerId columns to projects and workflows (for ownership transfer)
--   2. teams and team_members tables
--   3. project_access and workflow_access ACL tables

-- ===================================================================
-- 1. ADD OWNERSHIP COLUMNS TO PROJECTS AND WORKFLOWS
-- ===================================================================

-- Add ownerId to projects (initially same as creatorId)
ALTER TABLE projects ADD COLUMN owner_id VARCHAR;

-- Backfill ownerId with creatorId
UPDATE projects SET owner_id = creator_id WHERE owner_id IS NULL;

-- Make ownerId NOT NULL and add foreign key
ALTER TABLE projects ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT projects_owner_id_users_id_fk
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE no action ON UPDATE no action;

-- Add index for faster owner lookups
CREATE INDEX projects_owner_idx ON projects(owner_id);

-- Add comment for documentation
COMMENT ON COLUMN projects.owner_id IS 'Current owner of the project (can be transferred)';


-- Add ownerId to workflows (initially same as creatorId)
ALTER TABLE workflows ADD COLUMN owner_id VARCHAR;

-- Backfill ownerId with creatorId
UPDATE workflows SET owner_id = creator_id WHERE owner_id IS NULL;

-- Make ownerId NOT NULL and add foreign key
ALTER TABLE workflows ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE workflows ADD CONSTRAINT workflows_owner_id_users_id_fk
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE no action ON UPDATE no action;

-- Add index for faster owner lookups
CREATE INDEX workflows_owner_idx ON workflows(owner_id);

-- Add comment for documentation
COMMENT ON COLUMN workflows.owner_id IS 'Current owner of the workflow (can be transferred)';


-- ===================================================================
-- 2. CREATE TEAMS TABLE
-- ===================================================================

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by VARCHAR NOT NULL REFERENCES users(id) ON DELETE no action,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Add indices
CREATE INDEX teams_created_by_idx ON teams(created_by);

-- Add comment
COMMENT ON TABLE teams IS 'Teams for collaborative access to projects and workflows';


-- ===================================================================
-- 3. CREATE TEAM MEMBERS TABLE
-- ===================================================================

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT team_members_unique UNIQUE (team_id, user_id)
);

-- Add indices
CREATE INDEX team_members_team_idx ON team_members(team_id);
CREATE INDEX team_members_user_idx ON team_members(user_id);
CREATE INDEX team_members_team_user_idx ON team_members(team_id, user_id);

-- Add check constraint for valid roles
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('member', 'admin'));

-- Add comment
COMMENT ON TABLE team_members IS 'Team membership with roles (member | admin)';
COMMENT ON COLUMN team_members.role IS 'Team role: member (basic access) | admin (can manage team)';


-- ===================================================================
-- 4. CREATE PROJECT ACCESS (ACL) TABLE
-- ===================================================================

CREATE TABLE project_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  principal_type TEXT NOT NULL,
  principal_id UUID NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT project_access_unique UNIQUE (project_id, principal_type, principal_id)
);

-- Add indices
CREATE INDEX project_access_project_idx ON project_access(project_id);
CREATE INDEX project_access_principal_idx ON project_access(principal_type, principal_id);

-- Add check constraints for valid values
ALTER TABLE project_access ADD CONSTRAINT project_access_principal_type_check
  CHECK (principal_type IN ('user', 'team'));

ALTER TABLE project_access ADD CONSTRAINT project_access_role_check
  CHECK (role IN ('view', 'edit', 'owner'));

-- Add comments
COMMENT ON TABLE project_access IS 'Access control list for projects';
COMMENT ON COLUMN project_access.principal_type IS 'Type of principal: user | team';
COMMENT ON COLUMN project_access.principal_id IS 'ID of user or team (references users.id or teams.id)';
COMMENT ON COLUMN project_access.role IS 'Access role: view | edit | owner';


-- ===================================================================
-- 5. CREATE WORKFLOW ACCESS (ACL) TABLE
-- ===================================================================

CREATE TABLE workflow_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  principal_type TEXT NOT NULL,
  principal_id UUID NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT workflow_access_unique UNIQUE (workflow_id, principal_type, principal_id)
);

-- Add indices
CREATE INDEX workflow_access_workflow_idx ON workflow_access(workflow_id);
CREATE INDEX workflow_access_principal_idx ON workflow_access(principal_type, principal_id);

-- Add check constraints for valid values
ALTER TABLE workflow_access ADD CONSTRAINT workflow_access_principal_type_check
  CHECK (principal_type IN ('user', 'team'));

ALTER TABLE workflow_access ADD CONSTRAINT workflow_access_role_check
  CHECK (role IN ('view', 'edit', 'owner'));

-- Add comments
COMMENT ON TABLE workflow_access IS 'Access control list for workflows (overrides project ACL when present)';
COMMENT ON COLUMN workflow_access.principal_type IS 'Type of principal: user | team';
COMMENT ON COLUMN workflow_access.principal_id IS 'ID of user or team (references users.id or teams.id)';
COMMENT ON COLUMN workflow_access.role IS 'Access role: view | edit | owner';
