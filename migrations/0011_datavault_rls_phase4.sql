-- ============================================================================
-- 0011 — RLS coverage for DataVault row/value/column/access tables (DVH-3)
-- ============================================================================
-- migrations/0001_enable_rls.sql staged tenant_isolation policies for five
-- DataVault tables with a direct tenant_id column (datavault_api_tokens,
-- datavault_databases, datavault_number_sequences, datavault_row_notes,
-- datavault_tables) but left the two tables holding actual customer data —
-- datavault_rows and datavault_values — uncovered, along with datavault_columns,
-- datavault_table_permissions, datavault_database_access and
-- datavault_table_access. None of these six has a tenant_id column; tenancy is
-- derived through datavault_tables / datavault_databases.
--
-- SAFE TO SHIP: same as 0001 — RLS is bypassed for a table's owner and for
-- superusers unless FORCE mode is set, so this defines policies without
-- changing current behaviour anywhere until RLS enforcement is deliberately
-- turned on (docs/architecture/TENANT_ISOLATION_RLS.md). This ticket (DVH-3)
-- does not flip enforcement — it only closes a coverage gap.
--
-- Three derivation shapes (verified against shared/schema/datavault.ts, not
-- copy-pasted from one predicate):
--   datavault_rows, datavault_columns, datavault_table_permissions,
--     datavault_table_access  -> table_id    -> datavault_tables.tenant_id
--   datavault_database_access -> database_id -> datavault_databases.tenant_id
--   datavault_values          -> row_id -> datavault_rows.table_id
--                                       -> datavault_tables.tenant_id (two hops)
--
-- Reuses app_current_tenant() from 0001 (collapses '' and unset to NULL) and its
-- CASE-guard shape, so an empty GUC denies *without* evaluating the derivation
-- (avoids 22P02 from casting an empty string to ::uuid downstream). Idempotent:
-- DROP POLICY IF EXISTS + to_regclass guards + CREATE OR REPLACE. Helper
-- functions are STABLE SQL and deliberately do NOT pin search_path (mirrors
-- 0001 Part 2's app_owner_tenant precedent) so they resolve `public` in prod
-- and the per-worker schema in tests.
-- ============================================================================

-- Part 1 — derivation helpers.
CREATE OR REPLACE FUNCTION app_datavault_table_tenant(p_table_id uuid) RETURNS uuid
LANGUAGE sql
STABLE
AS $fn$
  SELECT t.tenant_id FROM datavault_tables t WHERE t.id = p_table_id;
$fn$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_datavault_database_tenant(p_database_id uuid) RETURNS uuid
LANGUAGE sql
STABLE
AS $fn$
  SELECT d.tenant_id FROM datavault_databases d WHERE d.id = p_database_id;
$fn$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_datavault_row_tenant(p_row_id uuid) RETURNS uuid
LANGUAGE sql
STABLE
AS $fn$
  SELECT t.tenant_id
  FROM datavault_rows r
  JOIN datavault_tables t ON t.id = r.table_id
  WHERE r.id = p_row_id;
$fn$;
--> statement-breakpoint

-- Part 2 — one-hop-via-table_id tables: datavault_rows, datavault_columns,
-- datavault_table_permissions, datavault_table_access.
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'datavault_rows',
    'datavault_columns',
    'datavault_table_permissions',
    'datavault_table_access'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass(quote_ident(t)) IS NULL THEN
      RAISE NOTICE 'RLS: table % not found, skipping', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING (CASE WHEN app_current_tenant() IS NULL THEN false '
      || 'ELSE app_datavault_table_tenant(table_id) = app_current_tenant() END) '
      || 'WITH CHECK (CASE WHEN app_current_tenant() IS NULL THEN false '
      || 'ELSE app_datavault_table_tenant(table_id) = app_current_tenant() END)',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint

-- Part 3 — datavault_database_access (one hop via database_id).
DO $$
BEGIN
  IF to_regclass('datavault_database_access') IS NOT NULL THEN
    ALTER TABLE datavault_database_access ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON datavault_database_access;
    CREATE POLICY tenant_isolation ON datavault_database_access
      USING (
        CASE WHEN app_current_tenant() IS NULL THEN false
             ELSE app_datavault_database_tenant(database_id) = app_current_tenant()
        END
      )
      WITH CHECK (
        CASE WHEN app_current_tenant() IS NULL THEN false
             ELSE app_datavault_database_tenant(database_id) = app_current_tenant()
        END
      );
  END IF;
END $$;
--> statement-breakpoint

-- Part 4 — datavault_values (two hops: row_id -> datavault_rows.table_id ->
-- datavault_tables.tenant_id). Holds the actual cell data.
DO $$
BEGIN
  IF to_regclass('datavault_values') IS NOT NULL THEN
    ALTER TABLE datavault_values ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON datavault_values;
    CREATE POLICY tenant_isolation ON datavault_values
      USING (
        CASE WHEN app_current_tenant() IS NULL THEN false
             ELSE app_datavault_row_tenant(row_id) = app_current_tenant()
        END
      )
      WITH CHECK (
        CASE WHEN app_current_tenant() IS NULL THEN false
             ELSE app_datavault_row_tenant(row_id) = app_current_tenant()
        END
      );
  END IF;
END $$;
--> statement-breakpoint
