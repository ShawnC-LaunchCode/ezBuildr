-- Migration 0048: Fix Autonumber Function (DataVault v4)
-- Description: Fixes off-by-one error in datavault_get_next_autonumber function
-- Date: December 2, 2025

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
      2, -- FIX: Start at 2 because we use 1 immediately
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
