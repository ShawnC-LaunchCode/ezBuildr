# DataVault Table Error Fix

## Problem

You encountered 500 (Internal Server Error) when trying to use the DataVault feature:
- `GET /api/datavault/tables?stats=true` - 500 error
- `POST /api/datavault/tables` - 500 error

## Root Cause

The DataVault database tables have not been created in your database. The migrations `0029_add_datavault_tables.sql` and `0030_add_auto_number_column_type.sql` need to be applied.

## Solution

Run the following command to apply the DataVault migrations:

```bash
npm run db:migrate:datavault
```

This script will:
1. Check if the `datavault_tables` table exists
2. If not, apply migration 0029 (creates datavault_tables, datavault_columns, datavault_rows, datavault_values)
3. Check if the `auto_number` column type exists
4. If not, apply migration 0030 (adds auto_number type and auto_number_start column)
5. Verify the schema is correctly set up

## What Gets Created

The script creates the following database objects:

### Tables
- `datavault_tables` - Table definitions for tenant-scoped custom tables
- `datavault_columns` - Column definitions for custom tables
- `datavault_rows` - Data rows in custom tables
- `datavault_values` - Cell values in rows

### Enums
- `datavault_column_type` - Column types: text, number, boolean, date, datetime, email, phone, url, json, auto_number

### Indexes and Constraints
- Foreign keys for tenant isolation
- Unique indexes for slug uniqueness
- Performance indexes for common queries

## Verification

After running the migration, the script will output:
- List of created DataVault tables
- List of available column types

You should see output like:
```
✅ DataVault tables already exist
✅ Auto-number column type already exists

🔍 Verifying DataVault schema...
📋 DataVault tables:
   - datavault_columns
   - datavault_rows
   - datavault_tables
   - datavault_values

📋 DataVault column types:
   - text
   - number
   - boolean
   - date
   - datetime
   - email
   - phone
   - url
   - json
   - auto_number

✅ DataVault schema is ready!
```

## Troubleshooting

### Database Connection Error
If you get a connection error:
```
Error: getaddrinfo EAI_AGAIN
```

Check that:
1. Your `.env` file exists with a valid `DATABASE_URL`
2. Your database is accessible (not paused/sleeping)
3. Your network connection is working

### Migration Already Applied
If the tables already exist, the script will skip that migration and just verify the schema.

## Alternative: Run All Migrations

If you want to run all pending migrations (not just DataVault):
```bash
npm run db:migrate
```

This uses Drizzle's migration system to apply all pending migrations in order.

## What's Next?

After applying the migrations, restart your development server:
```bash
npm run dev
```

Then try adding a table again. The DataVault feature should now work correctly!

## Manual Verification

You can verify the tables were created by connecting to your database and running:

```sql
-- List DataVault tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'datavault_%'
ORDER BY table_name;

-- Check column types enum
SELECT e.enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'datavault_column_type'
ORDER BY e.enumsortorder;
```

## Need Help?

If you continue to experience issues:
1. Check the server logs for detailed error messages
2. Verify your database connection is working
3. Try running `npm run db:push` to sync the schema
4. Create an issue on GitHub with the error details
