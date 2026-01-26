-- Migration to add CASCADE DELETE to workflow_personalization_settings foreign key
-- This ensures personalization settings are automatically cleaned up when a workflow is deleted

-- Step 1: Clean up any orphan records (settings where workflowId doesn't exist in workflows)
DELETE FROM "workflow_personalization_settings"
WHERE "workflow_id" NOT IN (SELECT "id" FROM "workflows");

-- Step 2: Drop the existing foreign key constraint
-- The constraint name follows Drizzle's naming convention: {table}_{column}_fkey
ALTER TABLE "workflow_personalization_settings"
DROP CONSTRAINT IF EXISTS "workflow_personalization_settings_workflow_id_workflows_id_fk";

-- Step 3: Re-add the foreign key constraint with ON DELETE CASCADE
ALTER TABLE "workflow_personalization_settings"
ADD CONSTRAINT "workflow_personalization_settings_workflow_id_workflows_id_fk"
FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;
