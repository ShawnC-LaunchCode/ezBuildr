-- Migration 0040: Enhance Autonumber Columns (DataVault v4 Micro-Phase 2)
-- Description: Upgrades auto_number to autonumber with prefix, padding, and yearly reset
-- Date: November 20, 2025

-- =====================================================================
-- STEP 1: ADD AUTONUMBER RESET POLICY ENUM
-- =====================================================================

CREATE TYPE "autonumber_reset_policy" AS ENUM('never', 'yearly');

-- =====================================================================
-- STEP 2: ADD NEW COLUMNS TO datavault_columns
-- =====================================================================

-- Add autonumber prefix (optional, e.g., "CASE", "INV")
ALTER TABLE "datavault_columns"
ADD COLUMN IF NOT EXISTS "autonumber_prefix" text;

-- Add autonumber padding (default 4 digits, e.g., 0001, 0002)
ALTER TABLE "datavault_columns"
ADD COLUMN IF NOT EXISTS "autonumber_padding" integer DEFAULT 4;

-- Add autonumber reset policy (never or yearly)
ALTER TABLE "datavault_columns"
ADD COLUMN IF NOT EXISTS "autonumber_reset_policy" "autonumber_reset_policy" DEFAULT 'never';

-- =====================================================================
-- STEP 3: CREATE datavault_number_sequences TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS "datavault_number_sequences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "table_id" uuid NOT NULL REFERENCES "datavault_tables"("id") ON DELETE CASCADE,
  "column_id" uuid NOT NULL REFERENCES "datavault_columns"("id") ON DELETE CASCADE,
  "prefix" text,
  "padding" integer NOT NULL DEFAULT 4,
  "next_value" integer NOT NULL DEFAULT 1,
  "reset_policy" "autonumber_reset_policy" NOT NULL DEFAULT 'never',
  "last_reset" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "idx_datavault_sequences_tenant" ON "datavault_number_sequences"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_datavault_sequences_table" ON "datavault_number_sequences"("table_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_datavault_sequences_column_unique" ON "datavault_number_sequences"("tenant_id", "table_id", "column_id");

-- =====================================================================
-- STEP 4: ADD 'autonumber' TO ENUM (ALIAS FOR 'auto_number')
-- =====================================================================

-- Note: PostgreSQL enums cannot remove values, so we'll add 'autonumber'
-- and deprecate 'auto_number' in code
ALTER TYPE "datavault_column_type" ADD VALUE IF NOT EXISTS 'autonumber';

-- =====================================================================
-- STEP 5: MIGRATE EXISTING auto_number COLUMNS
-- =====================================================================

-- Note: We keep auto_number columns as-is for now because PostgreSQL doesn't allow
-- using a newly added enum value in the same transaction. The application code
-- will handle both 'auto_number' and 'autonumber' as equivalent.

-- Create sequence records for existing auto_number columns
INSERT INTO "datavault_number_sequences" (
  "tenant_id",
  "table_id",
  "column_id",
  "prefix",
  "padding",
  "next_value",
  "reset_policy"
)
SELECT
  dt."tenant_id",
  dc."table_id",
  dc."id" as "column_id",
  NULL as "prefix",  -- No prefix by default
  4 as "padding",    -- Default padding
  COALESCE(
    (
      SELECT MAX((dv."value"->>0)::integer) + 1
      FROM "datavault_values" dv
      WHERE dv."column_id" = dc."id"
        AND jsonb_typeof(dv."value") = 'number'
    ),
    COALESCE(dc."auto_number_start", 1)
  ) as "next_value",
  'never' as "reset_policy"
FROM "datavault_columns" dc
JOIN "datavault_tables" dt ON dc."table_id" = dt."id"
WHERE dc."type" = 'auto_number'
ON CONFLICT ("tenant_id", "table_id", "column_id") DO NOTHING;

-- =====================================================================
-- STEP 6: ADD TRIGGER TO UPDATE updated_at ON SEQUENCES
-- =====================================================================

CREATE OR REPLACE FUNCTION update_datavault_sequence_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_datavault_sequence_timestamp
BEFORE UPDATE ON "datavault_number_sequences"
FOR EACH ROW
EXECUTE FUNCTION update_datavault_sequence_timestamp();

-- =====================================================================
-- STEP 7: ADD FUNCTION FOR ATOMIC INCREMENT
-- =====================================================================

CREATE OR REPLACE FUNCTION datavault_get_next_autonumber(
  p_tenant_id UUID,
  p_table_id UUID,
  p_column_id UUID,
  p_prefix TEXT DEFAULT NULL,
  p_padding INTEGER DEFAULT 4,
  p_reset_policy TEXT DEFAULT 'never'
) RETURNS TEXT AS $$
DECLARE
  v_next_value INTEGER;
  v_current_year INTEGER;
  v_last_reset_year INTEGER;
  v_formatted TEXT;
  v_sequence_row RECORD;
BEGIN
  -- Get current year
  v_current_year := EXTRACT(YEAR FROM now());

  -- Get or create sequence row with row-level lock
  PERFORM 1
  FROM "datavault_number_sequences"
  WHERE "tenant_id" = p_tenant_id
    AND "table_id" = p_table_id
    AND "column_id" = p_column_id
  FOR UPDATE;

  SELECT * INTO v_sequence_row
  FROM "datavault_number_sequences"
  WHERE "tenant_id" = p_tenant_id
    AND "table_id" = p_table_id
    AND "column_id" = p_column_id;

  -- If sequence doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO "datavault_number_sequences" (
      "tenant_id",
      "table_id",
      "column_id",
      "prefix",
      "padding",
      "next_value",
      "reset_policy",
      "last_reset"
    ) VALUES (
      p_tenant_id,
      p_table_id,
      p_column_id,
      p_prefix,
      p_padding,
      2,
      p_reset_policy::autonumber_reset_policy,
      now()
    )
    RETURNING * INTO v_sequence_row;

    v_next_value := 1;
  ELSE
    -- Check if we need to reset for yearly policy
    IF p_reset_policy = 'yearly' THEN
      v_last_reset_year := EXTRACT(YEAR FROM v_sequence_row.last_reset);

      IF v_last_reset_year IS NULL OR v_last_reset_year < v_current_year THEN
        -- Reset the sequence
        UPDATE "datavault_number_sequences"
        SET "next_value" = 2,
            "last_reset" = now()
        WHERE "tenant_id" = p_tenant_id
          AND "table_id" = p_table_id
          AND "column_id" = p_column_id;

        v_next_value := 1;
      ELSE
        -- Normal increment
        UPDATE "datavault_number_sequences"
        SET "next_value" = "next_value" + 1
        WHERE "tenant_id" = p_tenant_id
          AND "table_id" = p_table_id
          AND "column_id" = p_column_id
        RETURNING "next_value" - 1 INTO v_next_value;
      END IF;
    ELSE
      -- Never reset, just increment
      UPDATE "datavault_number_sequences"
      SET "next_value" = "next_value" + 1
      WHERE "tenant_id" = p_tenant_id
        AND "table_id" = p_table_id
        AND "column_id" = p_column_id
      RETURNING "next_value" - 1 INTO v_next_value;
    END IF;
  END IF;

  -- Format the value
  -- Format: PREFIX-YYYY-NNNN (if prefix + yearly) or PREFIX-NNNN (if prefix only) or NNNN (no prefix)
  IF p_prefix IS NOT NULL AND p_prefix != '' THEN
    IF p_reset_policy = 'yearly' THEN
      v_formatted := p_prefix || '-' || v_current_year::TEXT || '-' || LPAD(v_next_value::TEXT, p_padding, '0');
    ELSE
      v_formatted := p_prefix || '-' || LPAD(v_next_value::TEXT, p_padding, '0');
    END IF;
  ELSE
    v_formatted := LPAD(v_next_value::TEXT, p_padding, '0');
  END IF;

  RETURN v_formatted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION datavault_get_next_autonumber IS
'Atomically generates the next autonumber value with optional prefix and yearly reset support. Used by DataVault v4 autonumber columns.';

-- =====================================================================
-- STEP 8: ADD COMMENTS FOR DOCUMENTATION
-- =====================================================================

COMMENT ON TABLE "datavault_number_sequences" IS
'Stores sequence state for autonumber columns in DataVault tables. Supports prefix, padding, and yearly reset policies.';

COMMENT ON COLUMN "datavault_columns"."autonumber_prefix" IS
'Optional prefix for autonumber values (e.g., "CASE", "INV"). Only used when type=autonumber.';

COMMENT ON COLUMN "datavault_columns"."autonumber_padding" IS
'Number of digits to pad autonumber values (e.g., 4 -> "0001"). Only used when type=autonumber.';

COMMENT ON COLUMN "datavault_columns"."autonumber_reset_policy" IS
'When to reset the autonumber sequence: "never" (default) or "yearly" (reset on Jan 1). Only used when type=autonumber.';

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

-- Migration complete. Autonumber columns now support:
-- 1. Optional prefix (e.g., "CASE-0001")
-- 2. Configurable padding (default 4 digits)
-- 3. Yearly reset policy (resets on January 1st)
-- 4. Atomic sequence management via datavault_number_sequences table
--
-- Example formats:
-- - No prefix, never reset: "0001", "0002", "0003"
-- - Prefix, never reset: "INV-0001", "INV-0002"
-- - Prefix, yearly reset: "CASE-2025-0001", "CASE-2025-0002"
