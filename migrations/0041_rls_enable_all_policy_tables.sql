-- ============================================================================
-- 0041 — Re-assert ENABLE + FORCE ROW LEVEL SECURITY on every policy table
-- ============================================================================
-- WHY THIS EXISTS (measured on the dev branch, 2026-08-25):
--
--   pg_policies                     37 policies
--   pg_class.relrowsecurity = true   1 table  (only `sections`, from 0039)
--
-- A policy on a table whose `relrowsecurity` is false is INERT. Postgres does
-- not evaluate it at all. So 36 of 37 policies — projects, users, workflows,
-- connections, every datavault_* — were decorative, and the tenant isolation
-- this chain has been building since 0001 was not in force anywhere.
--
-- How it got that way is not fully determined and deliberately does not matter
-- here. What is known:
--   * No migration in the chain contains DISABLE ROW LEVEL SECURITY.
--   * 0001 enables behind a soft `to_regclass ... CONTINUE` guard that no-ops
--     silently when a table is missing — this is why production, which never
--     ran 0024, has none of 0001's tables enabled.
--   * 0024 repairs that and fails loud, and it IS recorded as applied on dev,
--     yet its tables are not enabled — so the flag was lost afterwards, while
--     the policies (recreated by 0026's NULLIF recast) survived. A table
--     rewrite via `db:push` is the most likely culprit; a RENAME (0038) is not,
--     since rename preserves both flag and policy.
--
-- The lesson encoded below: never enumerate the table list again. Drive the
-- enable off pg_policies itself, so any table that has a policy is enforced by
-- construction, and assert the postcondition so a future rewrite fails loudly
-- instead of silently reverting to "defined but inert".
--
-- FORCE: satisfies RLS-4 AC1. It is defence-in-depth only, not the thing that
-- makes isolation work — `neondb_owner` holds BYPASSRLS directly, and BYPASSRLS
-- beats FORCE. Isolation comes from the app connecting as a non-owner role
-- (`ezbuildr_app`). FORCE matters if the owner ever loses BYPASSRLS.
--
-- Safe to apply before the app is cut over: enabling RLS only affects roles
-- that are neither superuser nor BYPASSRLS. Migrations and the admin pool run
-- as `neondb_owner` and are unaffected.
--
-- Idempotent: ENABLE/FORCE are no-ops when already set. Schema-agnostic: uses
-- current_schema() so it applies correctly to per-worker test schemas.
-- ============================================================================

DO $$
DECLARE
  r record;
  enabled int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT c.oid::regclass AS tbl, c.relname
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
       AND c.relkind = 'r'
     ORDER BY 2
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', r.tbl);
    enabled := enabled + 1;
  END LOOP;

  RAISE NOTICE 'RLS 0041: enabled + forced row level security on % table(s) in schema %', enabled, current_schema();
END $$;
--> statement-breakpoint

-- Postcondition. A policy-bearing table that is not enforcing is the exact
-- silent failure this migration exists to end, so fail the migration rather
-- than leave it to be discovered by a tenant seeing another tenant's rows.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO bad
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = current_schema()
     AND c.relkind = 'r'
     AND (c.relrowsecurity = false OR c.relforcerowsecurity = false);

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'RLS 0041: these tables carry a policy but are not enforcing: %', bad;
  END IF;
END $$;
