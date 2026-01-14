# Database Migrations Guide

**Last Updated:** January 12, 2026
**Database:** PostgreSQL (Neon Serverless)
**ORM:** Drizzle ORM 0.39.1
**Total Tables:** 80+
**Total Migrations:** 77+

---

## Table of Contents

1. [Overview](#overview)
2. [Migration Naming Convention](#migration-naming-convention)
3. [Creating New Migrations](#creating-new-migrations)
4. [Migration Structure](#migration-structure)
5. [Migration Order & Dependencies](#migration-order--dependencies)
6. [Testing Migrations](#testing-migrations)
7. [Rollback Strategy](#rollback-strategy)
8. [Conflict Resolution](#conflict-resolution)
9. [Best Practices](#best-practices)
10. [Available Scripts](#available-scripts)

---

## Overview

VaultLogic uses Drizzle ORM for database migrations. All migrations are stored in `migrations/` with accompanying metadata in `migrations/meta/`. The migration system tracks schema changes chronologically and ensures consistency across environments.

**Key Components:**
- **SQL Migration Files:** `migrations/*.sql` - Actual SQL statements
- **Metadata Files:** `migrations/meta/*.json` - Migration registry and snapshots
- **Schema Definition:** `shared/schema.ts` - Drizzle schema (source of truth)

**Migration Workflow:**
1. Modify `shared/schema.ts`
2. Generate migration: `npm run db:generate`
3. Review generated SQL
4. Test locally
5. Apply to production: `npm run db:push`

---

## Migration Naming Convention

### Drizzle-Generated Migrations

Drizzle uses a sequential numbering system with descriptive names:

```
NNNN_descriptive_name.sql
```

**Format:**
- `NNNN`: 4-digit sequential number (0000, 0001, 0002, ...)
- `descriptive_name`: Snake_case description or auto-generated name
- `.sql`: Extension

**Examples:**
```
0000_daffy_roughhouse.sql          # Initial schema (Drizzle auto-name)
0001_remove_participants.sql       # Remove participants table
0029_add_datavault_tables.sql      # Add DataVault tables
0052_add_scripting_system.sql      # Add lifecycle hooks
```

**Auto-Generated Names:**
Drizzle sometimes generates random names (e.g., `0007_lying_namor.sql`). These should be renamed for clarity if they contain important changes.

### Manual Migrations

Manual migrations (not tracked by Drizzle) use descriptive names:

```
add_feature_name.sql
fix_issue_description.sql
backfill_data_name.sql
```

**Examples:**
```
add_invite_email_tracking.sql
add_organization_ownership.sql
backfill_account_database_ownership.sql
```

**Warning:** Manual migrations bypass Drizzle's tracking system. Use them only for:
- Data backfills
- Complex multi-step operations
- Emergency hotfixes

**After manual migration:**
```bash
npm run db:pull      # Sync schema from database
npm run db:generate  # Generate new migration if needed
```

---

## Creating New Migrations

### Method 1: Using Drizzle (Recommended)

1. **Modify Schema:**
   ```typescript
   // shared/schema.ts
   export const myNewTable = pgTable("my_new_table", {
     id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
     name: varchar("name").notNull(),
     createdAt: timestamp("created_at").defaultNow()
   });
   ```

2. **Generate Migration:**
   ```bash
   npm run db:generate
   ```

3. **Review Generated SQL:**
   - Check `migrations/NNNN_*.sql`
   - Verify statements are correct
   - Add comments if needed

4. **Test Migration:**
   ```bash
   npm run db:validate  # Check for conflicts
   npm run dev          # Test locally
   ```

5. **Apply Migration:**
   ```bash
   npm run db:push      # Apply to database
   ```

### Method 2: Using Migration Template (Semi-Automated)

1. **Generate Template:**
   ```bash
   npm run db:new-migration
   ```

2. **Follow Prompts:**
   - Enter migration description
   - Choose type (table/column/index/data/other)
   - Template is generated

3. **Edit Generated File:**
   - Fill in SQL statements
   - Add documentation comments
   - Test locally

### Method 3: Manual SQL (Advanced)

1. **Create File:**
   ```bash
   # migrations/add_my_feature.sql
   ```

2. **Write SQL:**
   ```sql
   -- Migration: Add My Feature
   -- Description: Detailed description of changes
   -- Tables Affected: table1, table2
   -- Date: YYYY-MM-DD

   CREATE TABLE my_feature (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name varchar NOT NULL
   );

   CREATE INDEX idx_my_feature_name ON my_feature(name);
   ```

3. **Apply Manually:**
   ```bash
   psql $DATABASE_URL -f migrations/add_my_feature.sql
   ```

4. **Sync Schema:**
   ```bash
   npm run db:pull
   npm run db:generate  # If needed
   ```

---

## Migration Structure

### Best Practice Template

```sql
-- =====================================================================
-- Migration: [Brief Title]
-- =====================================================================
-- Description: [Detailed description of what this migration does]
-- Tables Affected: [table1, table2, ...]
-- Author: [Your Name]
-- Date: [YYYY-MM-DD]
-- Dependencies: [Previous migrations this depends on]
-- =====================================================================

-- =====================================================================
-- CREATE ENUMS (if any)
-- =====================================================================

CREATE TYPE "my_enum" AS ENUM ('value1', 'value2', 'value3');
--> statement-breakpoint

-- =====================================================================
-- CREATE TABLES
-- =====================================================================

CREATE TABLE "my_table" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "status" "my_enum" DEFAULT 'value1' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

-- =====================================================================
-- ADD COLUMNS TO EXISTING TABLES
-- =====================================================================

ALTER TABLE "existing_table"
  ADD COLUMN "new_column" varchar(255);
--> statement-breakpoint

-- =====================================================================
-- CREATE INDEXES
-- =====================================================================

CREATE INDEX "idx_my_table_name" ON "my_table"("name");
--> statement-breakpoint
CREATE INDEX "idx_my_table_status" ON "my_table"("status");
--> statement-breakpoint

-- =====================================================================
-- ADD FOREIGN KEYS
-- =====================================================================

ALTER TABLE "my_table"
  ADD CONSTRAINT "fk_my_table_parent"
  FOREIGN KEY ("parent_id")
  REFERENCES "parent_table"("id")
  ON DELETE CASCADE;
--> statement-breakpoint

-- =====================================================================
-- DATA BACKFILL (if any)
-- =====================================================================

UPDATE "my_table"
SET "status" = 'value1'
WHERE "status" IS NULL;
--> statement-breakpoint

-- =====================================================================
-- DROP CONSTRAINTS (if any)
-- =====================================================================

ALTER TABLE "my_table"
  DROP CONSTRAINT IF EXISTS "old_constraint";
--> statement-breakpoint

-- =====================================================================
-- DROP COLUMNS (if any)
-- =====================================================================

ALTER TABLE "my_table"
  DROP COLUMN IF EXISTS "deprecated_column";
--> statement-breakpoint

-- =====================================================================
-- COMMENTS AND DOCUMENTATION
-- =====================================================================

COMMENT ON TABLE "my_table" IS 'Purpose of this table';
COMMENT ON COLUMN "my_table"."name" IS 'Purpose of this column';
```

### Statement Breakpoints

Drizzle uses `--> statement-breakpoint` to separate SQL statements. This is required for proper parsing.

**Format:**
```sql
CREATE TABLE foo (...);
--> statement-breakpoint
CREATE INDEX idx_foo ON foo(...);
--> statement-breakpoint
```

---

## Migration Order & Dependencies

### Complete Migration History (77 Migrations)

Listed in chronological order:

| # | Migration File | Description | Date Added | Key Changes |
|---|----------------|-------------|------------|-------------|
| 0 | `0000_daffy_roughhouse.sql` | Initial schema creation | Dec 11, 2024 | All core tables, enums, indexes |
| 1 | `0001_remove_participants.sql` | Remove participants table | Dec 11, 2024 | Cleanup unused table |
| 2 | `0002_add_mode_columns.sql` | Add mode tracking columns | Dec 11, 2024 | Workflow modes |
| 3 | `0003_add_step_aliases.sql` | Add step aliases for variables | Dec 11, 2024 | Variable naming system |
| 4 | `0004_add_teams_and_acls.sql` | Add teams and access control | Dec 11, 2024 | RBAC foundation |
| 5 | `0005_add_transform_block_phases.sql` | Add transform block phases | Dec 11, 2024 | Transform execution phases |
| 6 | `0006_add_updated_at_columns.sql` | Add updated_at timestamps | Dec 11, 2024 | Audit tracking |
| 7a | `0007_add_js_question_type.sql` | Add JavaScript question type | Dec 11, 2024 | JS computed fields |
| 7b | `0007_lying_namor.sql` | Auto-generated schema sync | Dec 24, 2024 | Drizzle sync |
| 8 | `0008_add_virtual_steps_for_transform_blocks.sql` | Add virtual steps | Jan 9, 2025 | Transform outputs |
| 9 | `0009_add_multi_tenant_data_model.sql` | Add multi-tenancy | Nov 12, 2024 | Tenants, workspaces |
| 10 | `0010_add_external_connections_and_secret_types.sql` | Add connections & secrets | Nov 12, 2024 | API integrations |
| 11 | `0011_add_trace_and_error_to_runs.sql` | Add run tracing | Nov 12, 2024 | Debug logs |
| 12 | `0012_add_analytics_sli_tables.sql` | Add analytics tables | Nov 12, 2024 | Metrics tracking |
| 13 | `0013_add_intake_portal_columns.sql` | Add portal columns | Nov 13, 2024 | Portal system |
| 14 | `0014_add_workflow_versioning_columns.sql` | Add versioning | Nov 13, 2024 | Version control |
| 15 | `0015_add_intake_config.sql` | Add intake configuration | Nov 13, 2024 | Intake settings |
| 16 | `0016_add_review_and_esign_tables.sql` | Add review & e-signature | Nov 13, 2024 | Review tasks, signatures |
| 17 | `0017_add_connections_table.sql` | Add unified connections | Nov 13, 2024 | Connection model |
| 18 | `0018_add_branding_and_domains.sql` | Add branding tables | Nov 13, 2024 | White-label features |
| 19 | `0019_add_collections_datastore.sql` | Add collections | Nov 13, 2024 | Legacy data structure |
| 20 | `0020_add_collection_block_types.sql` | Add collection blocks | Nov 13, 2024 | Collection operations |
| 21 | `0021_add_page_conditions.sql` | Add page conditions | Nov 14, 2024 | Section logic |
| 22 | `0022_add_question_conditions.sql` | Add question conditions | Nov 14, 2024 | Step-level logic |
| 23 | `0023_add_repeater_type.sql` | Add repeater type | Nov 15, 2024 | Repeating sections |
| 24a | `0024_add_document_engine_tables.sql` | Add document tables | Nov 15, 2024 | Document generation |
| 24b | `0024_add_performance_indexes.sql` | Add performance indexes | Nov 15, 2024 | Query optimization |
| 25 | `0025_fix_workflows_missing_columns.sql` | Fix workflow columns | Nov 16, 2024 | Schema repair |
| 26 | `0026_fix_schema_inconsistencies.sql` | Fix inconsistencies | Nov 17, 2024 | Schema normalization |
| 27 | `0027_fix_metrics_rollups_unique_index.sql` | Fix unique index | Nov 17, 2024 | Index repair |
| 28 | `0028_fix_workflow_status_enum.sql` | Fix workflow status enum | Nov 17, 2024 | Enum values |
| 29 | `0029_add_datavault_tables.sql` | Add DataVault Phase 1 | Nov 17, 2024 | DataVault foundation |
| 30 | `0030_add_auto_number_column_type.sql` | Add autonumber type | Nov 18, 2024 | Autonumber columns |
| 31 | `0031_fix_survey_status_enum.sql` | Fix survey status enum | Nov 18, 2024 | Legacy enum fix |
| 32 | `0032_add_primary_key_and_unique_columns.sql` | Add PK & unique constraints | Nov 18, 2024 | Data integrity |
| 33 | `0033_add_datavault_databases.sql` | Add database table | Nov 19, 2024 | Database grouping |
| 34 | `0034_add_reference_columns.sql` | Add reference columns | Nov 19, 2024 | Foreign key columns |
| 35 | `0035_add_datavault_sequences.sql` | Add sequences | Nov 19, 2024 | Autonumber sequences |
| 36a | `0036_add_column_descriptions.sql` | Add column descriptions | Nov 20, 2024 | Metadata |
| 36b | `0036_add_reference_cascade_policy.sql` | Add cascade policy | Nov 20, 2024 | FK behavior |
| 37 | `0037_add_column_width.sql` | Add column width | Nov 20, 2024 | UI layout |
| 38 | `0038_add_row_archiving.sql` | Add row archiving | Nov 21, 2024 | Soft delete |
| 39 | `0039_add_select_multiselect_columns.sql` | Add select types | Nov 21, 2024 | Choice columns |
| 40 | `0040_add_autonumber_enhancements.sql` | Enhance autonumber | Nov 21, 2024 | Formatting |
| 41 | `0041_add_datavault_row_notes.sql` | Add row notes | Nov 22, 2024 | Comments |
| 42 | `0042_add_datavault_api_tokens.sql` | Add API tokens | Nov 22, 2024 | External API access |
| 43 | `0043_add_datavault_table_permissions.sql` | Add table permissions | Nov 23, 2024 | Access control |
| 44 | `0044_add_step_default_values.sql` | Add default values | Nov 25, 2024 | Pre-fill support |
| 45 | `0045_sync_project_created_by.sql` | Sync project ownership | Nov 25, 2024 | Data consistency |
| 46a | `0046_add_final_documents_step_type.sql` | Add final documents type | Nov 25, 2024 | Document step |
| 46b | `0046_fix_workflow_runs_section_constraint.sql` | Fix section constraint | Nov 25, 2024 | FK repair |
| 47 | `0047_add_run_generated_documents_table.sql` | Add generated documents | Nov 26, 2024 | Document tracking |
| 48a | `0048_fix_autonumber_function.sql` | Fix autonumber function | Nov 26, 2024 | PL/pgSQL fix |
| 48b | `0048_sync_project_tenant_from_creator.sql` | Sync project tenant | Nov 26, 2024 | Tenant assignment |
| 49a | `0049_add_format_to_autonumber.sql` | Add autonumber format | Nov 27, 2024 | Format templates |
| 49b | `0049_add_sections_config_column.sql` | Add section config | Nov 27, 2024 | Section metadata |
| 50 | `0050_add_workflow_snapshots.sql` | Add snapshots | Nov 28, 2024 | Test data snapshots |
| 51a | `0051_add_new_block_types.sql` | Add new block types | Nov 29, 2024 | Query, external send |
| 51b | `0051_add_snapshot_version_hash.sql` | Add snapshot hash | Nov 29, 2024 | Version tracking |
| 52 | `0052_add_scripting_system.sql` | Add lifecycle hooks | Dec 7, 2024 | Custom scripting |
| 53 | `0053_upgrade_data_sources.sql` | Upgrade data sources | Dec 10, 2024 | Enhanced DS config |
| 54 | `0054_create_workflow_queries.sql` | Add workflow queries | Dec 11, 2024 | Query builder |
| 55 | `0055_add_query_block_support.sql` | Add query block support | Dec 12, 2024 | Query execution |
| 56 | `0056_add_datavault_block_types.sql` | Add DataVault blocks | Dec 13, 2024 | CRUD blocks |
| 57 | `0057_add_step_values_composite_index.sql` | Add composite index | Dec 14, 2024 | Query optimization |
| 58 | `0058_add_logic_rules_indexes.sql` | Add logic indexes | Dec 15, 2024 | Logic performance |
| 59 | `0059_add_performance_indexes.sql` | Add more indexes | Dec 16, 2024 | Global optimization |
| 60 | `0060_flashy_jimmy_woo.sql` | Auto-generated sync | Jan 9, 2025 | Drizzle sync |
| 61 | `add_invite_email_tracking.sql` | Add invite tracking | Dec 20, 2024 | Email tracking |
| 62 | `add_organization_ownership.sql` | Add org ownership | Dec 21, 2024 | Ownership model |
| 63 | `add_organization_tenant_scoping.sql` | Add org-tenant scoping | Dec 22, 2024 | Multi-tenancy |
| 64 | `add_performance_indexes.sql` | Add indexes (manual) | Dec 23, 2024 | Performance |
| 65 | `add_runs_ownership.sql` | Add run ownership | Dec 24, 2024 | Run ownership |
| 66 | `add_template_versioning.sql` | Add template versioning | Dec 25, 2024 | Template versions |
| 67 | `add_unique_constraints.sql` | Add unique constraints | Dec 26, 2024 | Data integrity |
| 68 | `add_workflow_runs_ownership_index.sql` | Add ownership index | Dec 27, 2024 | Index optimization |
| 69 | `backfill_account_database_ownership.sql` | Backfill ownership | Dec 28, 2024 | Data migration |

### Key Migration Phases

**Phase 1: Foundation (0-8)**
- Core schema, tables, enums
- Workflows, sections, steps, runs
- Transform blocks, step aliases

**Phase 2: Multi-Tenancy (9)**
- Tenants, workspaces, organizations
- Resource permissions, audit logs

**Phase 3: Integrations (10, 17)**
- Connections, secrets, OAuth2
- HTTP blocks, webhooks

**Phase 4: Analytics & Portal (11-15)**
- Analytics tables, metrics
- Portal authentication, run tracking
- Versioning system

**Phase 5: Advanced Features (16-23)**
- Review gates, e-signatures
- Branding, custom domains
- Collections (legacy)
- Conditional logic enhancements

**Phase 6: Document Engine (24)**
- Document generation
- Template parsing
- PDF/DOCX support

**Phase 7: Schema Fixes (25-28, 31-32)**
- Missing columns
- Enum fixes
- Constraint repairs

**Phase 8: DataVault (29-43)**
- Tables, columns, rows
- Databases, permissions
- Autonumber, references
- Row notes, API tokens

**Phase 9: Workflow Enhancements (44-51)**
- Default values
- Snapshots
- New block types
- Section configuration

**Phase 10: Custom Scripting (52)**
- Lifecycle hooks (4 phases)
- Document hooks (2 phases)
- Helper library, script console

**Phase 11: Query System (53-56)**
- Data sources upgrade
- Workflow queries
- Query blocks
- DataVault CRUD blocks

**Phase 12: Performance (57-59)**
- Composite indexes
- Logic indexes
- Global optimization

**Phase 13: Organization Ownership (61-69)**
- Invite tracking
- Organization ownership
- Multi-tenant scoping
- Run ownership
- Data backfills

### Critical Dependencies

**Must Apply In Order:**
1. `0000_daffy_roughhouse.sql` - Must be first (foundation)
2. `0009_add_multi_tenant_data_model.sql` - Required for tenant-scoped features
3. `0029_add_datavault_tables.sql` - Required for DataVault features
4. `0052_add_scripting_system.sql` - Required for lifecycle hooks
5. All `fix_*` migrations - Should be applied after their target feature

**Index Migrations:**
Performance index migrations can be applied in parallel if targeting different tables.

---

## Testing Migrations

### Local Testing Workflow

1. **Backup Database:**
   ```bash
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
   ```

2. **Validate Migration:**
   ```bash
   npm run db:validate
   ```

3. **Apply Migration:**
   ```bash
   npm run db:push
   ```

4. **Verify Changes:**
   ```sql
   -- Check table exists
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'my_new_table';

   -- Check columns
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'my_new_table';

   -- Check indexes
   SELECT indexname, indexdef FROM pg_indexes
   WHERE tablename = 'my_new_table';
   ```

5. **Test Application:**
   ```bash
   npm run dev
   # Test affected features
   ```

### Automated Validation

```bash
# Check migration consistency
npm run db:validate

# Output:
# ✓ All migrations are sequential
# ✓ No naming conflicts
# ✓ No duplicate table modifications
# ✓ Schema matches migration history
```

### Integration Testing

```bash
# Run full test suite
npm test

# Run integration tests
npm run test:integration

# Run specific database tests
npm test -- --grep "database"
```

---

## Rollback Strategy

### Drizzle Limitations

**Important:** Drizzle does NOT support automatic rollbacks. All rollbacks must be done manually.

### Manual Rollback Process

1. **Identify Problem Migration:**
   ```bash
   # Check recent migrations
   SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5;
   ```

2. **Create Rollback SQL:**
   ```sql
   -- rollback_NNNN_migration_name.sql

   -- Reverse the changes
   DROP TABLE IF EXISTS my_new_table;
   ALTER TABLE my_table DROP COLUMN IF EXISTS new_column;
   DROP INDEX IF EXISTS idx_my_index;
   ```

3. **Test Rollback:**
   ```bash
   # On staging/dev first!
   psql $DATABASE_URL -f rollback_NNNN_migration_name.sql
   ```

4. **Apply to Production:**
   ```bash
   # After thorough testing
   psql $PRODUCTION_DATABASE_URL -f rollback_NNNN_migration_name.sql
   ```

5. **Update Schema:**
   ```bash
   npm run db:pull      # Sync schema from DB
   npm run db:generate  # Generate new migration if needed
   ```

### Prevention Strategies

**Always:**
- Test migrations on staging first
- Backup database before migration
- Review generated SQL carefully
- Use transactions where possible
- Add rollback SQL in migration comments

**Never:**
- Apply untested migrations to production
- Skip validation steps
- Delete data without backup
- Modify multiple tables in one migration (when avoidable)

---

## Conflict Resolution

### Common Conflicts

1. **Duplicate Migration Numbers:**
   - Two developers create `0061_*` simultaneously
   - **Fix:** Rename one to `0062_*`, update journal

2. **Same Table Modified:**
   - Two migrations alter same table
   - **Fix:** Merge migrations or apply sequentially

3. **Enum Value Conflicts:**
   - Two migrations add same enum value
   - **Fix:** Coordinate enum changes, use `IF NOT EXISTS`

4. **Foreign Key Dependencies:**
   - Migration references non-existent table
   - **Fix:** Ensure parent table exists first

### Conflict Detection

```bash
npm run db:validate
```

**Checks:**
- Sequential numbering
- Duplicate table modifications
- Missing dependencies
- Schema drift

### Resolving Schema Drift

**Symptom:** `shared/schema.ts` doesn't match database

**Fix:**
```bash
# Option 1: Pull from database (if DB is source of truth)
npm run db:pull

# Option 2: Push schema to database (if schema is source of truth)
npm run db:push

# Option 3: Generate migration for differences
npm run db:generate
```

### Merge Conflict Resolution

**Scenario:** Git merge creates migration conflicts

**Steps:**
1. List all migrations:
   ```bash
   ls -1 migrations/*.sql | sort
   ```

2. Identify conflicts (same number, different files)

3. Rename conflicting migration:
   ```bash
   mv migrations/0061_my_feature.sql migrations/0062_my_feature.sql
   ```

4. Update `migrations/meta/_journal.json`:
   ```json
   {
     "idx": 62,
     "version": "7",
     "when": 1234567890123,
     "tag": "0062_my_feature",
     "breakpoints": true
   }
   ```

5. Reapply migrations:
   ```bash
   npm run db:push
   ```

---

## Best Practices

### Migration Design

**DO:**
- Keep migrations small and focused
- Add descriptive comments
- Use transactions when possible
- Test rollback procedures
- Document breaking changes
- Use `IF NOT EXISTS` for idempotency

**DON'T:**
- Mix DDL and data changes
- Modify production data without backup
- Skip validation
- Use raw SQL for complex logic (use stored procedures)
- Delete data without archiving

### Schema Changes

**Adding Columns:**
```sql
-- Good: Nullable or with default
ALTER TABLE my_table ADD COLUMN new_col varchar DEFAULT 'default_value';

-- Bad: NOT NULL without default (breaks existing rows)
ALTER TABLE my_table ADD COLUMN new_col varchar NOT NULL;
```

**Renaming Columns:**
```sql
-- Good: Create new, migrate data, drop old
ALTER TABLE my_table ADD COLUMN new_name varchar;
UPDATE my_table SET new_name = old_name;
ALTER TABLE my_table DROP COLUMN old_name;

-- Better: Use views for backward compatibility
CREATE VIEW my_table_v1 AS SELECT id, old_name AS new_name FROM my_table;
```

**Dropping Tables:**
```sql
-- Good: Archive first
CREATE TABLE my_table_archive AS SELECT * FROM my_table;
DROP TABLE my_table;

-- Better: Soft delete
ALTER TABLE my_table ADD COLUMN deleted_at timestamp;
UPDATE my_table SET deleted_at = NOW() WHERE condition;
```

### Performance Considerations

**Indexes:**
- Add indexes after bulk data operations
- Use `CONCURRENTLY` for production:
  ```sql
  CREATE INDEX CONCURRENTLY idx_name ON table(column);
  ```

**Large Tables:**
- Avoid full table scans
- Use batching for updates:
  ```sql
  UPDATE my_table SET col = val WHERE id IN (
    SELECT id FROM my_table WHERE condition LIMIT 1000
  );
  ```

**Enum Changes:**
- Can't remove enum values easily
- Add new values at end:
  ```sql
  ALTER TYPE my_enum ADD VALUE 'new_value';
  ```

### Documentation

**Required Comments:**
```sql
-- =====================================================================
-- Migration: [Title]
-- =====================================================================
-- Description: [What this does]
-- Tables: [Affected tables]
-- Breaking Changes: [Yes/No - explain if yes]
-- Rollback: [How to rollback]
-- =====================================================================
```

**Optional Comments:**
- Performance impact notes
- Data migration steps
- Related feature tickets
- Testing instructions

---

## Available Scripts

### Core Scripts

```bash
# Generate new migration from schema changes
npm run db:generate

# Apply migrations to database
npm run db:push

# Pull schema from database
npm run db:pull

# View database in Drizzle Studio
npm run db:studio

# Validate migrations (custom script)
npm run db:validate

# Generate new migration from template (custom script)
npm run db:new-migration
```

### Utility Scripts

```bash
# Backup database
pg_dump $DATABASE_URL > backup.sql

# Restore database
psql $DATABASE_URL < backup.sql

# Check migration status
psql $DATABASE_URL -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 10;"

# View table structure
psql $DATABASE_URL -c "\d+ table_name"

# View indexes
psql $DATABASE_URL -c "\di+ index_name"
```

### Database Inspection

```bash
# List all tables
psql $DATABASE_URL -c "\dt"

# List all sequences
psql $DATABASE_URL -c "\ds"

# List all enums
psql $DATABASE_URL -c "\dT"

# Show table size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_total_relation_size('table_name'));"
```

---

## Troubleshooting

### Common Issues

**Issue: "relation already exists"**
```bash
# Fix: Drop and recreate or use IF NOT EXISTS
DROP TABLE IF EXISTS my_table;
CREATE TABLE my_table (...);
```

**Issue: "column does not exist"**
```bash
# Fix: Run migration that adds column
npm run db:push
```

**Issue: "enum value already exists"**
```sql
-- Fix: Check if exists first
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'new_value') THEN
    ALTER TYPE my_enum ADD VALUE 'new_value';
  END IF;
END $$;
```

**Issue: Migration order wrong**
```bash
# Fix: Rename migrations to correct order
npm run db:validate  # Shows ordering issues
```

**Issue: Schema drift detected**
```bash
# Fix: Sync schema
npm run db:pull      # Pull from DB
npm run db:generate  # Generate migration
```

### Recovery Procedures

**Corrupted Migration:**
1. Restore from backup
2. Reapply migrations sequentially
3. Validate schema

**Failed Migration:**
1. Check error logs
2. Rollback changes (manual SQL)
3. Fix migration SQL
4. Reapply

**Lost Metadata:**
1. Restore `migrations/meta/` from Git
2. Regenerate if needed:
   ```bash
   npm run db:pull
   npm run db:generate
   ```

---

## Additional Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Database Schema Reference](./DATABASE_SCHEMA.md)
- [VaultLogic Architecture](../CLAUDE.md)

---

**Document Maintainer:** Development Team
**Review Cycle:** Quarterly
**Next Review:** April 12, 2026
