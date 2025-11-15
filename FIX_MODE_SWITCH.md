# Fix: Mode Switching 500 Error

## Problem
When trying to switch from Advanced mode to Easy mode (or vice versa) in the workflow builder, you receive a 500 Internal Server Error.

## Root Cause
The database is missing required columns that the application expects:
- `mode_override` column in the `workflows` table
- `owner_id` column in the `workflows` table
- `default_mode` column in the `users` table

These columns should have been added by migrations 0002 and 0004, but they may not have been applied to your database.

## Solution

### Option 1: Run the Fix Script (Recommended)

Run the automated fix script that checks for and adds any missing columns:

```bash
npx tsx scripts/fixModeSwitch.ts
```

This script will:
- Check if `mode_override` column exists in workflows table
- Check if `owner_id` column exists in workflows table
- Check if `default_mode` column exists in users table
- Add any missing columns with proper constraints and indices
- Backfill data as needed

### Option 2: Manual SQL (If fix script doesn't work)

If the automated script fails or you prefer to apply the fixes manually, run these SQL commands directly on your database:

```sql
-- Add mode_override column to workflows
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS mode_override TEXT;
ALTER TABLE workflows ADD CONSTRAINT workflows_mode_override_check
  CHECK (mode_override IS NULL OR mode_override IN ('easy', 'advanced'));
CREATE INDEX IF NOT EXISTS idx_workflows_mode_override ON workflows(mode_override);

-- Add owner_id column to workflows
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS owner_id VARCHAR;
UPDATE workflows SET owner_id = creator_id WHERE owner_id IS NULL;
ALTER TABLE workflows ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE workflows ADD CONSTRAINT workflows_owner_id_users_id_fk
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE no action;
CREATE INDEX IF NOT EXISTS workflows_owner_idx ON workflows(owner_id);

-- Add default_mode column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_mode TEXT NOT NULL DEFAULT 'easy';
ALTER TABLE users ADD CONSTRAINT users_default_mode_check
  CHECK (default_mode IN ('easy', 'advanced'));
CREATE INDEX IF NOT EXISTS idx_users_default_mode ON users(default_mode);
```

### Option 3: Apply All Missing Migrations

If you want to ensure all migrations are applied:

```bash
# Apply core migrations (includes mode and ownership columns)
npx tsx scripts/applyMigration0024.ts  # Tenant/project columns
npx tsx scripts/applyMigration0025.ts  # Owner columns

# Or apply all missing migrations
npx tsx scripts/applyAllMissingMigrations.ts
```

## Verification

After applying the fix:

1. **Restart your application server** (if running)
2. **Clear your browser cache** or do a hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
3. **Open a workflow in the builder**
4. **Try switching modes** using the dropdown in the top-right corner
5. The switch should now work without errors

## Testing the Fix

To verify the columns were added correctly, you can check the database:

```sql
-- Check workflows table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'workflows'
AND column_name IN ('mode_override', 'owner_id');

-- Check users table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name = 'default_mode';
```

Expected output:
- `mode_override`: TEXT, nullable
- `owner_id`: VARCHAR, NOT NULL
- `default_mode`: TEXT, NOT NULL

## Additional Help

If you continue to experience issues after applying this fix:

1. Check the server logs for detailed error messages
2. Verify your DATABASE_URL is correct
3. Ensure you have the necessary database permissions
4. Run the migration check script: `npx tsx scripts/checkAllMigrations.ts`
5. Create a GitHub issue with the error details

## Related Files
- Migration: `migrations/0002_add_mode_columns.sql`
- Migration: `migrations/0004_add_teams_and_acls.sql`
- Fix Script: `scripts/fixModeSwitch.ts`
- Service: `server/services/WorkflowService.ts` (setModeOverride method)
- API Route: `server/routes/workflows.routes.ts` (PUT /api/workflows/:id/mode)
