-- Migration 0049: Add Format to Autonumber Function (DataVault v4)
-- Description: Adds p_format parameter to datavault_get_next_autonumber function
-- Date: December 3, 2025

CREATE OR REPLACE FUNCTION datavault_get_next_autonumber(
  p_tenant_id UUID,
  p_table_id UUID,
  p_column_id UUID,
  p_prefix TEXT DEFAULT NULL,
  p_padding INTEGER DEFAULT 4,
  p_reset_policy TEXT DEFAULT 'never',
  p_format TEXT DEFAULT NULL
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
  -- Note: SELECT INTO ... FOR UPDATE is not supported in PL/pgSQL
  PERFORM *
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
      2, -- Start at 2 because we use 1 immediately
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
  IF p_format IS NOT NULL AND p_format != '' THEN
    v_formatted := p_format;
    v_formatted := REPLACE(v_formatted, '{YYYY}', TO_CHAR(now(), 'YYYY'));
    v_formatted := REPLACE(v_formatted, '{YY}', TO_CHAR(now(), 'YY'));
    v_formatted := REPLACE(v_formatted, '{MM}', TO_CHAR(now(), 'MM'));
    v_formatted := REPLACE(v_formatted, '{DD}', TO_CHAR(now(), 'DD'));
    -- Handle padding in format like {000} or {0000}
    -- We assume the placeholder is {0...} and replace it with padded number
    -- Simple regex replacement for {0+}
    v_formatted := REGEXP_REPLACE(v_formatted, '\{0+\}', LPAD(v_next_value::TEXT, p_padding, '0'));
    
    -- Fallback if no {0...} found but we need to insert number?
    -- If format doesn't contain number placeholder, append it? No, assume format is complete.
  ELSE
    IF p_prefix IS NOT NULL AND p_prefix != '' THEN
      IF p_reset_policy = 'yearly' THEN
        v_formatted := p_prefix || '-' || v_current_year::TEXT || '-' || LPAD(v_next_value::TEXT, p_padding, '0');
      ELSE
        v_formatted := p_prefix || '-' || LPAD(v_next_value::TEXT, p_padding, '0');
      END IF;
    ELSE
      v_formatted := LPAD(v_next_value::TEXT, p_padding, '0');
    END IF;
  END IF;

  RETURN v_formatted;
END;
$$ LANGUAGE plpgsql;
