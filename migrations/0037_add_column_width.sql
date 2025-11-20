-- Migration 0037: Add column width support for DataVault
-- Allows users to resize columns and persist width preferences

ALTER TABLE datavault_columns
ADD COLUMN IF NOT EXISTS width_px INTEGER DEFAULT 150;

CREATE INDEX IF NOT EXISTS idx_columns_width ON datavault_columns(width_px);

COMMENT ON COLUMN datavault_columns.width_px IS
'Column width in pixels for UI display (default 150px)';
