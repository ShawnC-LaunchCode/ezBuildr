-- Migration: Add question-level conditional logic
-- Stage 20 PR 3: Question-Level Conditions
-- Date: 2025-11-14
--
-- Adds visibleIf condition expression to steps (questions)
-- to enable conditional question visibility within pages

-- Add visibleIf column to steps table
-- If condition evaluates to false, question is hidden from UI
ALTER TABLE steps
ADD COLUMN visible_if jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN steps.visible_if IS 'Condition expression for question visibility. If false, question is hidden and not validated. Format: { op: "equals", left: { type: "variable", path: "..." }, right: { type: "value", value: ... } }';

-- No data migration needed (new optional field)
