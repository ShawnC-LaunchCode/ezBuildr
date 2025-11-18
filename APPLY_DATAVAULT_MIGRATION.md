# DataVault Migration Guide

## Issue
Your application is showing a 500 error when accessing `/api/datavault/tables` because the DataVault tables don't exist in your database yet.

## Solution: Apply Migrations 0029 & 0030

You need to apply TWO migrations:
- **0029**: Creates the core DataVault tables
- **0030**: Adds auto-number column type (optional but recommended)

### Option 1: Neon SQL Editor (Easiest)

1. Go to https://console.neon.tech/
2. Select your VaultLogic project
3. Click "SQL Editor" in the left sidebar
4. **First**, copy the contents of `migrations/0029_add_datavault_tables.sql`
5. Paste into the SQL Editor and click "Run"
6. You should see "Query completed successfully"
7. **Then**, copy the contents of `migrations/0030_add_auto_number_column_type.sql`
8. Paste into the SQL Editor and click "Run"

### Option 2: Local psql (If you have PostgreSQL client installed)

```bash
# From your project root
# Apply migration 0029 (core tables)
psql "postgresql://neondb_owner:npg_LYP2cC3DhGsx@ep-gentle-leaf-ahsz38kq-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require" < migrations/0029_add_datavault_tables.sql

# Apply migration 0030 (auto-number feature)
psql "postgresql://neondb_owner:npg_LYP2cC3DhGsx@ep-gentle-leaf-ahsz38kq-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require" < migrations/0030_add_auto_number_column_type.sql
```

### Option 3: Using the migration script locally

```bash
# Make sure you're in the project directory
cd /path/to/VaultLogic

# Set the DATABASE_URL
export DATABASE_URL="postgresql://neondb_owner:npg_LYP2cC3DhGsx@ep-gentle-leaf-ahsz38kq-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Run the migration
npm run db:migrate
```

## Verification

After applying the migration, verify it worked:

1. In Neon SQL Editor, run:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE 'datavault_%'
ORDER BY table_name;
```

You should see:
- `datavault_columns`
- `datavault_rows`
- `datavault_tables`
- `datavault_values`

2. Refresh your browser at http://localhost:5000/datavault

The error should be gone and you should see the DataVault interface.

## What These Tables Do

- **datavault_tables**: Stores your custom table definitions
- **datavault_columns**: Stores column definitions for each table
- **datavault_rows**: Stores data rows
- **datavault_values**: Stores actual cell values (flexible JSONB storage)

## Need Help?

If you encounter any issues:
1. Check that the migration SQL ran without errors
2. Verify all 4 tables were created
3. Restart your dev server: `npm run dev`
4. Check server logs for any other errors
