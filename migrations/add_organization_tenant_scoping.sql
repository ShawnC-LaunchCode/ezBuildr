-- Add tenantId to organizations table
-- This migration ensures organizations are scoped to tenants for proper isolation
-- Date: 2026-01-08

-- Step 1: Add tenantId column (nullable first)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Step 2: Backfill tenantId from creator's tenant
UPDATE organizations o
SET tenant_id = u.tenant_id
FROM users u
WHERE o.created_by_user_id = u.id
  AND o.tenant_id IS NULL;

-- Step 3: For organizations without creator (if any), use default tenant
-- Find the first tenant in the system
DO $$
DECLARE
  default_tenant_id UUID;
  orgs_without_tenant INTEGER;
BEGIN
  -- Get first tenant
  SELECT id INTO default_tenant_id FROM tenants ORDER BY created_at LIMIT 1;

  -- Count organizations still without tenant
  SELECT COUNT(*) INTO orgs_without_tenant FROM organizations WHERE tenant_id IS NULL;

  IF orgs_without_tenant > 0 THEN
    IF default_tenant_id IS NULL THEN
      -- No tenants exist - create a default one
      INSERT INTO tenants (name, slug)
      VALUES ('Default Tenant', 'default')
      RETURNING id INTO default_tenant_id;

      RAISE NOTICE 'Created default tenant with id: %', default_tenant_id;
    END IF;

    -- Assign default tenant to all organizations without one
    UPDATE organizations
    SET tenant_id = default_tenant_id
    WHERE tenant_id IS NULL;

    RAISE NOTICE 'Assigned default tenant to % organizations', orgs_without_tenant;
  END IF;
END $$;

-- Step 4: Make tenantId NOT NULL (safe now because Step 3 ensures all orgs have a tenant)
ALTER TABLE organizations
ALTER COLUMN tenant_id SET NOT NULL;

-- Step 5: Add foreign key constraint
ALTER TABLE organizations
ADD CONSTRAINT IF NOT EXISTS organizations_tenant_id_fkey
FOREIGN KEY (tenant_id)
REFERENCES tenants(id)
ON DELETE CASCADE;

-- Step 6: Add index for performance
CREATE INDEX IF NOT EXISTS idx_organizations_tenant ON organizations(tenant_id);

-- Step 7: Add comment
COMMENT ON COLUMN organizations.tenant_id IS 'Organizations are scoped to tenants for isolation';
