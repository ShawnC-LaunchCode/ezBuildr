-- Migration: Add Phase Support to Transform Blocks
-- This migration adds:
--   1. phase column to transform_blocks (execution phase)
--   2. sectionId column to transform_blocks (for section-specific blocks)
--   3. index for phase-based queries

-- ===================================================================
-- 1. ADD PHASE COLUMN TO TRANSFORM_BLOCKS
-- ===================================================================

-- Add phase column with default value
ALTER TABLE transform_blocks ADD COLUMN phase "block_phase" NOT NULL DEFAULT 'onSectionSubmit';

-- Add comment for documentation
COMMENT ON COLUMN transform_blocks.phase IS 'Execution phase: onRunStart, onSectionEnter, onSectionSubmit, onNext, or onRunComplete';

-- ===================================================================
-- 2. ADD SECTION_ID COLUMN TO TRANSFORM_BLOCKS
-- ===================================================================

-- Add sectionId column (nullable - workflow-scoped blocks have NULL)
ALTER TABLE transform_blocks ADD COLUMN section_id UUID;

-- Add foreign key constraint
ALTER TABLE transform_blocks ADD CONSTRAINT transform_blocks_section_id_sections_id_fk
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE ON UPDATE NO ACTION;

-- Add comment for documentation
COMMENT ON COLUMN transform_blocks.section_id IS 'Section this block is scoped to (NULL = workflow-scoped)';

-- ===================================================================
-- 3. ADD INDEXES FOR PERFORMANCE
-- ===================================================================

-- Add index for phase-based queries
CREATE INDEX transform_blocks_phase_idx ON transform_blocks(workflow_id, phase);

-- Add comment
COMMENT ON INDEX transform_blocks_phase_idx IS 'Index for fast phase-based block lookup';
