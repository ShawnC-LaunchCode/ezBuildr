-- Migration 0038: Add row archiving (soft delete) for DataVault
-- Allows rows to be archived instead of permanently deleted

ALTER TABLE datavault_rows
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_rows_deleted_at ON datavault_rows(deleted_at);
CREATE INDEX IF NOT EXISTS idx_rows_table_active ON datavault_rows(table_id, deleted_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN datavault_rows.deleted_at IS
'Timestamp when row was archived/soft-deleted. NULL means active.';
