-- 0050 — tenant isolation for `blocks` (BLK-1)
--
-- `blocks` was the last workflow-owned table with no RLS policy: measured on
-- production 2026-09-19, `relrowsecurity = false` and zero policies, while
-- `steps`, `pages` and `sections` have all been covered since 0031/0038/0039.
-- Its isolation rested entirely on BlockService.verifyAccess, with nothing
-- underneath — and `blocks.config` holds DataVault table ids, query ids and
-- external-send configuration.
--
-- `blocks` has no `tenant_id` column. Like `steps`, the tenant is derived
-- through the parent workflow, so this is a join policy over `workflows`,
-- byte-identical in shape to 0031's `steps` policy with `blocks.workflow_id`
-- substituted. Do not hand-roll a different predicate: 0027's NULL-safe
-- comparison and 0031's public-workflow disjunct both exist for reasons that
-- cost real incidents.
--
-- The `is_public AND status = 'active'` disjunct is in USING **only**, exactly
-- as 0031 has it: an anonymous public-link run must be able to READ the blocks
-- it executes, but nothing anonymous may ever WRITE one.
--
-- ⚠️ This migration is only half of BLK-1. `BlockService.getBlocksForPhase`
-- reads on the bare pool; under enforcement that returns zero rows, and
-- `BlockRunner.runPhase` reads "no blocks" as "nothing to run" and reports
-- success. That path is scoped in the same commit as this file.

DO $$
BEGIN
  IF to_regclass('blocks') IS NULL THEN
    RAISE EXCEPTION 'RLS blocks (0050): expected table blocks to exist and it does not';
  END IF;

  ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE blocks FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS tenant_isolation ON blocks;
  CREATE POLICY tenant_isolation ON blocks
    USING (
      CASE WHEN app_current_tenant() IS NULL THEN false
           ELSE EXISTS (
             SELECT 1 FROM workflows w
             WHERE w.id = blocks.workflow_id
               AND app_owner_tenant(w.owner_type, w.owner_uuid, w.owner_id, w.creator_id, w.project_id)
                     = app_current_tenant()
           )
      END
      OR EXISTS (
        SELECT 1 FROM workflows w
        WHERE w.id = blocks.workflow_id
          AND w.is_public = true
          AND w.status = 'active'
      )
    )
    WITH CHECK (
      CASE WHEN app_current_tenant() IS NULL THEN false
           ELSE EXISTS (
             SELECT 1 FROM workflows w
             WHERE w.id = blocks.workflow_id
               AND app_owner_tenant(w.owner_type, w.owner_uuid, w.owner_id, w.creator_id, w.project_id)
                     = app_current_tenant()
           )
      END
    );
END $$;
