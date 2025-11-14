-- Migration: Add page-level conditional logic
-- Stage 20 PR 2: Page-Level Conditions (Show/Skip Logic)
-- Date: 2025-11-14
--
-- Adds visibleIf and skipIf condition expressions to sections (pages)
-- to enable conditional page navigation in Intake Runner 2.0

-- Add visibleIf column to sections table
-- If condition evaluates to false, page is hidden from navigation
ALTER TABLE sections
ADD COLUMN visible_if jsonb DEFAULT NULL;

-- Add skipIf column to sections table
-- If condition evaluates to true, runner auto-advances past this page
ALTER TABLE sections
ADD COLUMN skip_if jsonb DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN sections.visible_if IS 'Condition expression for page visibility. If false, page is hidden. Format: { op: "equals", left: { type: "variable", path: "..." }, right: { type: "value", value: ... } }';
COMMENT ON COLUMN sections.skip_if IS 'Condition expression for page skip logic. If true, page is automatically skipped. Takes precedence over normal navigation.';

-- No data migration needed (new optional fields)
