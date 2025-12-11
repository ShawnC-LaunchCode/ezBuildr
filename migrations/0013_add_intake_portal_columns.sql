-- Stage 12: Intake Portal (Public Workflow Runner)
-- Add columns to workflows table for public workflow access

-- Add isPublic flag to enable/disable public access
ALTER TABLE "workflows"
ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;

-- Add unique slug for public access (URL-friendly)
ALTER TABLE "workflows"
ADD COLUMN IF NOT EXISTS "slug" text;

-- Add requireLogin flag to optionally require authentication for public workflows
ALTER TABLE "workflows"
ADD COLUMN IF NOT EXISTS "require_login" boolean DEFAULT false NOT NULL;

-- Create unique index on (tenant_id, slug) to ensure slug uniqueness per tenant
-- First, we need to handle existing NULL slugs and ensure tenantId is available
-- For workflows without projectId (legacy), we'll need to skip the constraint
CREATE UNIQUE INDEX IF NOT EXISTS workflows_tenant_slug_unique_idx
ON workflows(project_id, slug)
WHERE slug IS NOT NULL AND project_id IS NOT NULL;

-- Create index on isPublic for faster queries
CREATE INDEX IF NOT EXISTS workflows_is_public_idx ON workflows(is_public);

-- Create index on slug for faster public lookups
CREATE INDEX IF NOT EXISTS workflows_slug_idx ON workflows(slug) WHERE slug IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN workflows.is_public IS 'Whether this workflow is accessible via public intake portal';
COMMENT ON COLUMN workflows.slug IS 'URL-friendly slug for public access (unique per tenant)';
COMMENT ON COLUMN workflows.require_login IS 'Whether authentication is required for public workflow access';
