-- Fix Orphaned Workflows - SQL Script
-- Assigns workflows without projectId to a default project

-- Step 1: Create default tenant if doesn't exist
DO $$
DECLARE
  v_tenant_id UUID;
  v_project_id UUID;
BEGIN
  -- Get or create default tenant
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;

  IF v_tenant_id IS NULL THEN
    INSERT INTO tenants (owner_id, name, slug)
    VALUES (
      (SELECT id FROM users LIMIT 1),
      'Default Workspace',
      'default-workspace'
    )
    RETURNING id INTO v_tenant_id;
  END IF;

  -- Get or create default project
  SELECT id INTO v_project_id FROM projects WHERE tenant_id = v_tenant_id LIMIT 1;

  IF v_project_id IS NULL THEN
    INSERT INTO projects (tenant_id, name, description, created_by)
    VALUES (
      v_tenant_id,
      'Legacy Workflows',
      'Workflows migrated from pre-project system',
      (SELECT id FROM users LIMIT 1)
    )
    RETURNING id INTO v_project_id;
  END IF;

  -- Update orphaned workflows
  UPDATE workflows
  SET project_id = v_project_id
  WHERE project_id IS NULL;

  -- Output results
  RAISE NOTICE 'Updated % orphaned workflows to project %',
    (SELECT COUNT(*) FROM workflows WHERE project_id = v_project_id),
    v_project_id;
END $$;
