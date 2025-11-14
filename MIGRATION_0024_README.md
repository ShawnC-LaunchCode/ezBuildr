# Migration 0024: Fix Workflows Display Issue

## Problem Summary

**Issue:** Workflows are not displaying in the UI, and creating new workflows fails.

**Root Cause:** Database schema is out of sync with application code. Critical columns are missing from the `users`, `projects`, and `workflows` tables, causing queries to fail.

### Missing Columns

1. **Users table:**
   - `tenant_id` - Required for multi-tenant support
   - `full_name`, `first_name`, `last_name`, `profile_image_url` - User profile fields

2. **Projects table:**
   - `tenant_id` - Required for tenant isolation
   - `name` - Used instead of `title` in new code
   - `archived` - For soft-delete functionality

3. **Workflows table:**
   - `project_id` - Links workflow to project (CRITICAL)
   - `name` - Used instead of `title` in new code
   - `current_version_id` - Links to active workflow version

### Impact

Without these columns:
- Authentication fails (can't read `user.tenant_id`)
- Workflows can't be queried (missing `project_id`, `name`)
- Workflow creation fails (missing required foreign keys)
- Projects can't be filtered (missing `tenant_id`, `archived`)

---

## Solution

Apply migration `0024_fix_workflows_missing_columns.sql` which:

1. ✅ Creates `tenants` table if missing
2. ✅ Adds all missing columns to users, projects, and workflows tables
3. ✅ Creates default tenant ("Default Organization")
4. ✅ Assigns all existing users to default tenant
5. ✅ Assigns all existing projects to default tenant
6. ✅ Creates default project ("Default Project")
7. ✅ Assigns all existing workflows to default project
8. ✅ Adds foreign key constraints
9. ✅ Creates performance indices

---

## How to Apply the Fix

### Option 1: Using the TypeScript Script (Recommended)

This is the easiest method and includes error handling and progress feedback.

```bash
# From the VaultLogic directory
npx tsx scripts/applyMigration0024.ts
```

If DATABASE_URL is not in your .env file, provide it explicitly:

```bash
DATABASE_URL="postgresql://user:password@host:5432/database" npx tsx scripts/applyMigration0024.ts
```

### Option 2: Direct SQL Execution

If you prefer to run the SQL directly:

1. **Via psql command line:**
   ```bash
   psql "$DATABASE_URL" < migrations/0024_fix_workflows_missing_columns.sql
   ```

2. **Via Railway CLI (if using Railway):**
   ```bash
   railway run psql < migrations/0024_fix_workflows_missing_columns.sql
   ```

3. **Via Neon Console:**
   - Go to your Neon project console
   - Open the SQL Editor
   - Copy the contents of `migrations/0024_fix_workflows_missing_columns.sql`
   - Paste and execute

### Option 3: Using the General Fix Script

You can also use the comprehensive fix script:

```bash
npx tsx scripts/fixAllMissingColumns.ts
```

This script performs similar fixes but uses direct ALTER TABLE commands instead of a migration file.

---

## Verification

After applying the migration, verify it worked:

### 1. Check Tables

```sql
-- Check users table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('tenant_id', 'full_name');

-- Check projects table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'projects'
AND column_name IN ('tenant_id', 'name', 'archived');

-- Check workflows table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'workflows'
AND column_name IN ('project_id', 'name', 'current_version_id');
```

Expected: All columns should be returned.

### 2. Check Data

```sql
-- Check tenant exists
SELECT * FROM tenants;

-- Check users have tenant_id
SELECT id, email, tenant_id FROM users LIMIT 5;

-- Check projects have tenant_id
SELECT id, name, tenant_id FROM projects LIMIT 5;

-- Check workflows have project_id
SELECT id, name, project_id FROM workflows LIMIT 5;
```

Expected: All records should have non-null foreign key values.

### 3. Test the Application

1. Restart your server:
   ```bash
   npm run dev
   ```

2. Log in to VaultLogic

3. Navigate to "Workflows" page
   - Should display existing workflows (if any)
   - Should not show database errors

4. Try creating a new workflow
   - Click "New Workflow"
   - Enter a name
   - Click "Create"
   - Should succeed without errors

---

## Troubleshooting

### Error: "relation 'tenants' does not exist"

This is expected if you're running the migration for the first time. The migration creates the table. If this error persists after running the migration, check:

1. Did the migration run successfully?
2. Are you connected to the correct database?

### Error: "column 'tenant_id' does not exist"

This means the migration didn't apply successfully. Try:

1. Check database connection
2. Verify you have CREATE/ALTER permissions
3. Look for errors in the migration output

### Error: "duplicate key value violates unique constraint"

This might happen if you run the migration multiple times. It's safe to ignore - the migration uses `IF NOT EXISTS` clauses.

### Still Having Issues?

1. Check application logs for specific error messages
2. Verify DATABASE_URL is correct
3. Ensure you have database permissions
4. Try the general fix script: `npx tsx scripts/fixAllMissingColumns.ts`
5. Check the CLAUDE.md troubleshooting section

---

## Prevention

To prevent this issue in the future:

1. **Always run migrations after pulling code:**
   ```bash
   git pull
   npm run db:migrate  # or apply new migrations manually
   ```

2. **Check for new migrations:**
   ```bash
   ls -la migrations/ | tail -5
   ```

3. **Keep production database in sync:**
   - Migrations should be applied as part of deployment
   - Consider adding migration check to CI/CD pipeline

---

## Technical Details

### Why This Happened

The codebase evolved to support multi-tenant architecture (Stages 9-16), but the production database wasn't migrated. The code expects these columns, but they don't exist in older deployments.

### Safe to Apply?

Yes. This migration is idempotent and safe to run multiple times:
- Uses `IF NOT EXISTS` for table/column creation
- Uses `ADD COLUMN IF NOT EXISTS` for all alterations
- Handles foreign key conflicts gracefully
- Creates default data only if missing

### Performance Impact

Minimal. On a database with:
- < 1000 users: ~1 second
- < 1000 projects: ~1 second
- < 1000 workflows: ~1 second

Total migration time: < 5 seconds for small databases

---

## Migration File

Location: `migrations/0024_fix_workflows_missing_columns.sql`

This migration is comprehensive and fixes all known schema sync issues as of November 14, 2025.

---

## Questions?

If you encounter issues not covered here:
1. Check the application logs
2. Review the CLAUDE.md troubleshooting section
3. Create a GitHub issue with error details
