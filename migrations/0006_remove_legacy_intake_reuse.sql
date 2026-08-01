-- Remove the retired workflow classification, upstream-run reuse, and
-- assignment configuration while preserving the modern public intake
-- settings stored in the same JSONB column.
UPDATE "workflows"
SET "intake_config" = "intake_config"
    - 'isIntake'
    - 'upstreamWorkflowId'
    - 'assignments'
WHERE "intake_config" ?| ARRAY['isIntake', 'upstreamWorkflowId', 'assignments'];
--> statement-breakpoint
-- Intake-linked defaults were builder-only objects. Static scalar defaults
-- remain untouched. This targets workflow steps, not DataVault column defaults.
UPDATE "steps"
SET "default_value" = NULL
WHERE jsonb_typeof("default_value") = 'object'
  AND "default_value" ->> 'source' = 'intake';
--> statement-breakpoint
-- The legacy assignment screen was selected by this section-level flag.
UPDATE "sections"
SET "config" = "config" - 'intakeAssignment'
WHERE "config" ? 'intakeAssignment';
