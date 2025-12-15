-- Migration: Add read_table and list_tools to block_type enum
-- Date: December 2025
-- Description: Adds read_table and list_tools values to the block_type enum for DataVault integration

-- Add new block types to the block_type enum
-- Note: PostgreSQL requires using ALTER TYPE ... ADD VALUE which is safe and doesn't require table locks

-- Read table block type - reads data from DataVault tables
ALTER TYPE block_type ADD VALUE IF NOT EXISTS 'read_table';

-- List tools block type - transforms list variables (filter, sort, limit, select)
ALTER TYPE block_type ADD VALUE IF NOT EXISTS 'list_tools';

-- Migration complete
-- No existing data affected - new types are purely additive
-- Existing blocks continue to use their current types
