-- ============================================================================
-- 0002 — Runtime prerequisites: extensions + DataVault autonumber functions
-- ============================================================================
-- pgcrypto provides gen_random_uuid()/digest() used by the app and by column
-- defaults; created here (idempotent) so `db:migrate` alone yields a
-- runtime-ready database, matching what tests/setup.ts sets up.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- DataVault autonumber PL/pgSQL functions
-- ---------------------------------------------------------------------------
-- Production code (server/repositories/DatavaultRowsRepository.ts) calls these
-- three functions, but they previously existed ONLY in tests/setup.ts
-- (ensureDbFunctions) — no migration created them, so fresh/CI databases lacked
-- them entirely. This migration is the single source of truth for them.
--
-- Definitions are relocated verbatim from tests/setup.ts (no behaviour change):
--   * datavault_get_next_autonumber (7-arg) — the real v4 generator used by the
--     current `autonumber` column type (prefix / padding / yearly reset).
--   * datavault_get_next_auto_number (3-arg) — serves the LEGACY `auto_number`
--     column type. This is a STUB that returns 1 (pre-existing gap carried over
--     from tests/setup.ts). Tracked as a separate DataVault follow-up; not
--     changed here to keep this migration behaviour-preserving.
--   * datavault_cleanup_sequence — no-op today (cannot reconstruct the hashed
--     sequence name from column_id alone). Same pre-existing limitation.
-- CREATE OR REPLACE throughout → idempotent and safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION datavault_get_next_autonumber(
  p_tenant_id UUID,
  p_table_id UUID,
  p_column_id UUID,
  p_context_key TEXT,
  p_min_digits INTEGER DEFAULT 1,
  p_prefix TEXT DEFAULT '',
  p_format TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_sequence_name TEXT;
  v_next_val BIGINT;
  v_year TEXT;
  v_formatted TEXT;
  v_final_result TEXT;
  v_prefix TEXT;
BEGIN
  -- MD5 hash keeps the sequence name unique and within the 63-char limit.
  v_sequence_name := 'seq_' || md5(p_tenant_id::text || '_' || p_column_id::text);
  IF p_format = 'YYYY' THEN
      v_year := to_char(current_date, 'YYYY');
      v_sequence_name := v_sequence_name || '_' || v_year;
  END IF;
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', v_sequence_name);
  EXECUTE format('SELECT nextval(%L)', v_sequence_name) INTO v_next_val;
  v_prefix := COALESCE(p_prefix, '');
  v_formatted := lpad(v_next_val::text, COALESCE(p_min_digits, 4), '0');
  IF v_prefix <> '' THEN
     v_final_result := v_prefix || '-';
  ELSE
     v_final_result := '';
  END IF;
  IF p_format = 'YYYY' THEN
       v_final_result := v_final_result || v_year || '-';
  END IF;
  v_final_result := v_final_result || v_formatted;
  RETURN v_final_result;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION datavault_cleanup_sequence(p_column_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    -- No-op: the sequence name is md5(tenant_id || '_' || column_id), which
    -- cannot be reconstructed from column_id alone. Left as a follow-up.
    NULL;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION datavault_get_next_auto_number(
  p_table_id UUID,
  p_column_id UUID,
  p_start_value INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- STUB for the legacy `auto_number` column type (returns 1). Pre-existing
    -- behaviour carried over from tests/setup.ts — tracked as a DataVault
    -- follow-up, not fixed in this migration.
    RETURN 1;
END;
$$;
