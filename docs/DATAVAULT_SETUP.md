# DataVault Setup & Troubleshooting Guide

**Last Updated:** November 18, 2025

## Overview

This guide helps you set up DataVault Phase 1 and troubleshoot common issues.

---

## Prerequisites

Before using DataVault, ensure you have:

1. ✅ PostgreSQL database (Neon or self-hosted)
2. ✅ `DATABASE_URL` environment variable configured
3. ✅ Applied migration `0028_add_datavault_tables.sql`

---

## Initial Setup

### Step 1: Verify Database Connection

Check that your `DATABASE_URL` is configured:

```bash
# Check if DATABASE_URL is set
echo $DATABASE_URL

# Or check .env file
cat .env | grep DATABASE_URL
```

If not set, add it to your `.env` file:

```bash
DATABASE_URL=postgresql://user:password@host.neon.tech/vault_logic
```

### Step 2: Apply DataVault Migration

The DataVault tables must be created before use. Run the migration script:

```bash
npx tsx scripts/applyMigration0028.ts
```

**Expected output:**
```
🔄 Applying migration 0028 (DataVault tables)...
📄 Migration file loaded
⚙️  Executing migration...
✅ Migration 0028 applied successfully!
✨ DataVault Phase 1 tables created:
   - datavault_tables
   - datavault_columns
   - datavault_rows
   - datavault_values
```

### Step 3: Verify Tables Were Created

After running the migration, verify the tables exist:

**Using psql:**
```bash
psql $DATABASE_URL -c "\dt datavault_*"
```

**Expected output:**
```
                List of relations
 Schema |       Name        | Type  |  Owner
--------+-------------------+-------+---------
 public | datavault_columns | table | user
 public | datavault_rows    | table | user
 public | datavault_tables  | table | user
 public | datavault_values  | table | user
```

**Using SQL (Neon console):**
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE 'datavault_%';
```

### Step 4: Start the Server

```bash
npm run dev
```

Navigate to `/datavault` to access the DataVault dashboard.

---

## Common Issues

### ❌ Error: 500 Internal Server Error when creating tables

**Symptoms:**
- Browser console shows: `Failed to load resource: the server responded with a status of 500`
- Endpoint: `POST /api/datavault/tables`

**Cause:** The `datavault_tables` table doesn't exist in your database.

**Solution:** Apply migration 0028:
```bash
npx tsx scripts/applyMigration0028.ts
```

---

### ❌ Error: "DATABASE_URL must be set"

**Symptoms:**
- Migration script fails with: `Error: DATABASE_URL must be set. Did you forget to provision a database?`

**Cause:** `DATABASE_URL` environment variable is not configured.

**Solution:** Add `DATABASE_URL` to your `.env` file:

```bash
# .env
DATABASE_URL=postgresql://user:password@host.neon.tech/vault_logic
```

Then run the migration again.

---

### ❌ Error: "relation 'datavault_tables' does not exist"

**Symptoms:**
- Server logs show: `error: relation "datavault_tables" does not exist`
- DataVault pages show errors or don't load

**Cause:** Migration 0028 hasn't been applied.

**Solution:**
1. Verify database connection: `echo $DATABASE_URL`
2. Run migration: `npx tsx scripts/applyMigration0028.ts`
3. Restart server: `npm run dev`

---

### ❌ Error: "cross-env: not found"

**Symptoms:**
- `npm run dev` fails with: `sh: 1: cross-env: not found`

**Cause:** The `cross-env` package is missing from node_modules.

**Solution:** Install dependencies:
```bash
npm install
```

Or install cross-env specifically:
```bash
npm install cross-env --save-dev
```

---

### ❌ Error: "Tables already exist"

**Symptoms:**
- Migration script shows: `⚠️  Tables already exist - migration may have been applied previously`

**Cause:** Migration was already applied successfully.

**Solution:** This is not an error. Your database is already set up correctly. If you're still experiencing issues:
1. Verify tables exist: `psql $DATABASE_URL -c "\dt datavault_*"`
2. Check server logs for other errors
3. Restart the server: `npm run dev`

---

## Manual Migration (Alternative Method)

If the migration script fails, you can apply the SQL manually:

### Using Neon Console

1. Log in to [Neon Console](https://console.neon.tech/)
2. Navigate to your project → SQL Editor
3. Copy the contents of `migrations/0028_add_datavault_tables.sql`
4. Paste into SQL Editor
5. Click "Run"

### Using psql

```bash
psql $DATABASE_URL < migrations/0028_add_datavault_tables.sql
```

---

## Verifying DataVault Setup

Once migration is applied, test the setup:

### 1. Check API Health

```bash
curl http://localhost:5000/api/datavault/tables \
  -H "Cookie: your-session-cookie"
```

Expected: `200 OK` with `[]` (empty array if no tables created yet)

### 2. Create a Test Table via UI

1. Navigate to `/datavault/tables`
2. Click "Create New Table"
3. Enter:
   - Name: "Test Table"
   - Description: "Testing DataVault setup"
   - Add a column: "Name" (type: text)
4. Click "Create Table"
5. Verify table appears in list

### 3. Verify Database Contents

```bash
psql $DATABASE_URL -c "SELECT id, name, slug FROM datavault_tables;"
```

You should see your test table.

---

## Database Schema Reference

DataVault Phase 1 uses 4 tables:

### `datavault_tables`
- Stores table definitions
- Tenant-scoped with unique slugs
- Cascades to columns, rows, and values on delete

### `datavault_columns`
- Stores column schemas for each table
- 9 supported types: text, number, boolean, date, datetime, email, phone, url, json
- Type changes are prevented after creation

### `datavault_rows`
- Stores row records
- Links to table via `table_id`
- Tracks creator with `created_by`

### `datavault_values`
- Stores cell values (JSONB)
- One record per row/column intersection
- Unique constraint on (row_id, column_id)

**Total Storage:** ~410 lines of SQL in migration

---

## Rollback (If Needed)

To remove DataVault tables:

```sql
-- WARNING: This deletes all DataVault data
DROP TABLE IF EXISTS datavault_values CASCADE;
DROP TABLE IF EXISTS datavault_rows CASCADE;
DROP TABLE IF EXISTS datavault_columns CASCADE;
DROP TABLE IF EXISTS datavault_tables CASCADE;
DROP TYPE IF EXISTS datavault_column_type;
```

---

## Support & Resources

- **Implementation Summary:** See `DATAVAULT_PHASE_1_SUMMARY.md`
- **Test Coverage:** See `tests/DATAVAULT_TESTS.md`
- **API Reference:** See [API Endpoints](#api-reference) in DATAVAULT_PHASE_1_SUMMARY.md
- **GitHub Issues:** Report bugs at https://github.com/ShawnC-LaunchCode/VaultLogic/issues

---

## Quick Reference: Common Commands

```bash
# Check if migration applied
psql $DATABASE_URL -c "\dt datavault_*"

# Apply migration
npx tsx scripts/applyMigration0028.ts

# Start dev server
npm run dev

# Run tests
npm test

# Check database connection
echo $DATABASE_URL
```

---

**Last Updated:** November 18, 2025
**Status:** DataVault Phase 1 Complete
**Migration:** 0028_add_datavault_tables.sql
