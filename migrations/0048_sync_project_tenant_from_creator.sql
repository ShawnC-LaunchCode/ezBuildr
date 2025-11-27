-- Migration: Sync project tenant_id from creator's tenant
-- Issue: Projects may have null tenant_id, causing 404 errors in API endpoints
-- Fix: Set project tenant_id to match the creator's tenant for all null tenant_id projects
-- Date: November 26, 2025

-- Update projects without tenant_id to use their creator's tenant
UPDATE projects p
SET tenant_id = u.tenant_id
FROM users u
WHERE p.tenant_id IS NULL
  AND p.created_by IS NOT NULL
  AND p.created_by = u.id
  AND u.tenant_id IS NOT NULL;

-- Also handle projects using creator_id (legacy field)
UPDATE projects p
SET tenant_id = u.tenant_id
FROM users u
WHERE p.tenant_id IS NULL
  AND p.creator_id IS NOT NULL
  AND p.creator_id = u.id
  AND u.tenant_id IS NOT NULL;
