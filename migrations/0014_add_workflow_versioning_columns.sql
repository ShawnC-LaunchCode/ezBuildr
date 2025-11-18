-- Stage 13: Publishing, Snapshots & Rollback
-- Add columns to workflow_versions and workflows tables for version management

-- Add versioning metadata to workflow_versions
ALTER TABLE "workflow_versions"
ADD COLUMN IF NOT EXISTS "notes" text,
ADD COLUMN IF NOT EXISTS "changelog" jsonb,
ADD COLUMN IF NOT EXISTS "checksum" text;

-- Add pinnedVersionId to workflows for version pinning
ALTER TABLE "workflows"
ADD COLUMN IF NOT EXISTS "pinned_version_id" uuid;

-- Add foreign key constraint for pinnedVersionId
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workflows_pinned_version_fk'
  ) THEN
    ALTER TABLE workflows
    ADD CONSTRAINT workflows_pinned_version_fk
    FOREIGN KEY (pinned_version_id)
    REFERENCES workflow_versions(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- Create index on checksum for integrity checks
CREATE INDEX IF NOT EXISTS workflow_versions_checksum_idx
ON workflow_versions(checksum)
WHERE checksum IS NOT NULL;

-- Create index on pinned_version_id
CREATE INDEX IF NOT EXISTS workflows_pinned_version_idx
ON workflows(pinned_version_id)
WHERE pinned_version_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN workflow_versions.notes IS 'Release notes for this version';
COMMENT ON COLUMN workflow_versions.changelog IS 'Structured changelog data (JSON)';
COMMENT ON COLUMN workflow_versions.checksum IS 'SHA256 checksum of version content for integrity verification';
COMMENT ON COLUMN workflows.pinned_version_id IS 'Pinned version ID for API/Intake (overrides currentVersionId when set)';
