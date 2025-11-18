# DataVault Table Viewing Error - 500 Internal Server Error

## Issue

When trying to view DataVault tables, you get:
```
GET http://localhost:5000/api/datavault/tables?stats=true 500 (Internal Server Error)
```

## Root Cause

The DataVault database tables have not been created in your database. The application code expects these tables to exist, but they are missing.

## Solution

Run the DataVault migration script:

```bash
node scripts/applyDatavaultFix.cjs
```

Or use the npm script:

```bash
npm run db:migrate:datavault
```

## What This Does

The script will:
1. Check if `datavault_tables` table exists
2. If not, apply migration 0029 which creates:
   - `datavault_tables` - Table definitions with tenant isolation
   - `datavault_columns` - Column definitions for custom tables
   - `datavault_rows` - Data rows in tables
   - `datavault_values` - Cell values
   - Enum type `datavault_column_type` with values: text, number, boolean, date, datetime, email, phone, url, json
3. Check if `auto_number` column type exists
4. If not, apply migration 0030 which adds:
   - `auto_number` to the `datavault_column_type` enum
   - `auto_number_start` column to `datavault_columns` table
5. Verify the schema is set up correctly

## Expected Output

After running the migration, you should see:

```
🔄 Checking and applying DataVault migrations...

📄 DataVault tables do not exist, applying migration 0029...
⚙️  Executing migration 0029...
✅ Migration 0029 applied successfully!

✅ Auto-number column type already exists

🔍 Verifying DataVault schema...
📋 DataVault tables:
   ✓ datavault_columns
   ✓ datavault_rows
   ✓ datavault_tables
   ✓ datavault_values

📋 DataVault column types:
   ✓ text
   ✓ number
   ✓ boolean
   ✓ date
   ✓ datetime
   ✓ email
   ✓ phone
   ✓ url
   ✓ json
   ✓ auto_number

✅ DataVault schema is ready!

💡 Next step: Restart your dev server with: npm run dev
```

## After Applying the Fix

1. Restart your development server:
   ```bash
   npm run dev
   ```

2. Try viewing DataVault tables again - the 500 error should be resolved!

## Verification

You can verify the tables were created by connecting to your database:

```sql
-- List all DataVault tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'datavault_%'
ORDER BY table_name;

-- Should return:
-- datavault_columns
-- datavault_rows
-- datavault_tables
-- datavault_values
```

## Troubleshooting

### Database Connection Error

If you get:
```
Error: getaddrinfo EAI_AGAIN
```

This means the database is not accessible. Check:
1. Your `.env` or `.env.local` file has a valid `DATABASE_URL`
2. Your database is not paused/sleeping (Neon databases auto-pause after inactivity)
3. Your network connection is working
4. You have the correct database credentials

### Tables Already Exist

If you see:
```
✅ DataVault tables already exist
```

But you're still getting the 500 error, the issue might be:
1. The tables exist but are missing columns (check with the verification SQL above)
2. There's a different error - check your server logs for the actual error message
3. You may need to drop and recreate the tables

To drop and recreate:
```sql
DROP TABLE IF EXISTS datavault_values CASCADE;
DROP TABLE IF EXISTS datavault_rows CASCADE;
DROP TABLE IF EXISTS datavault_columns CASCADE;
DROP TABLE IF EXISTS datavault_tables CASCADE;
DROP TYPE IF EXISTS datavault_column_type CASCADE;
```

Then run the migration script again.

## Related Documentation

- [DATAVAULT_FIX_README.md](../../DATAVAULT_FIX_README.md) - General DataVault setup guide
- [DATAVAULT_TABLE_CREATION_FIX.md](./DATAVAULT_TABLE_CREATION_FIX.md) - Tenant ID issues
- [APPLY_DATAVAULT_MIGRATION.md](../../APPLY_DATAVAULT_MIGRATION.md) - Migration details

## Migration Files

- `migrations/0029_add_datavault_tables.sql` - Creates core DataVault tables
- `migrations/0030_add_auto_number_column_type.sql` - Adds auto-number column type

---

**Last Updated:** November 18, 2025
**Issue:** 500 error when viewing DataVault tables
**Resolution:** Apply DataVault migrations
