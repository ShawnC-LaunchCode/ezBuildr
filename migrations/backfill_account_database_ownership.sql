-- Migration: Backfill Account-Scoped Database Ownership
-- Description: Fixes NULL ownership for account-scoped databases created before ownership model
-- Date: 2026-01-05

-- ====================================
-- 1. Backfill account-scoped databases
-- ====================================

-- Strategy: Set ownership to first user in the tenant
-- This is conservative - admins can manually reassign if needed

UPDATE datavault_databases db
SET
  owner_type = 'user',
  owner_uuid = (
    SELECT id
    FROM users u
    WHERE u.tenant_id = db.tenant_id
    ORDER BY u.created_at ASC
    LIMIT 1
  )
WHERE
  db.owner_type IS NULL
  AND db.scope_type = 'account'
  AND EXISTS (
    SELECT 1
    FROM users u
    WHERE u.tenant_id = db.tenant_id
  );

-- ====================================
-- 2. Log databases that couldn't be backfilled
-- ====================================

-- For databases with no users in tenant (edge case), leave NULL
-- These will be handled by the "allow all" logic in canAccessAsset
-- Admins should manually assign ownership via UI

-- Count databases that couldn't be backfilled
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM datavault_databases db
  WHERE
    db.owner_type IS NULL
    AND db.scope_type = 'account'
    AND NOT EXISTS (
      SELECT 1
      FROM users u
      WHERE u.tenant_id = db.tenant_id
    );

  IF orphan_count > 0 THEN
    RAISE WARNING 'Found % account-scoped databases with no tenant users. These require manual ownership assignment.', orphan_count;
  END IF;
END $$;
