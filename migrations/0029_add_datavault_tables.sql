-- Migration: Add DataVault Phase 1 tables
-- Description: Creates the core DataVault tables for tenant-scoped data storage
-- Tables: datavault_tables, datavault_columns, datavault_rows, datavault_values
-- Date: November 17, 2025

-- =====================================================================
-- CREATE DATAVAULT COLUMN TYPE ENUM
-- =====================================================================

CREATE TYPE "datavault_column_type" AS ENUM (
  'text',
  'number',
  'boolean',
  'date',
  'datetime',
  'email',
  'phone',
  'url',
  'json'
);

-- =====================================================================
-- CREATE DATAVAULT TABLES
-- =====================================================================

-- DataVault Tables: Tenant-scoped table definitions
CREATE TABLE IF NOT EXISTS "datavault_tables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "owner_user_id" varchar,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- DataVault Columns: Column definitions for tables
CREATE TABLE IF NOT EXISTS "datavault_columns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "table_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "type" "datavault_column_type" NOT NULL,
  "required" boolean DEFAULT false NOT NULL,
  "order_index" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- DataVault Rows: Data rows in tables
CREATE TABLE IF NOT EXISTS "datavault_rows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "table_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "created_by" varchar,
  "updated_by" varchar
);

-- DataVault Values: Cell values in rows
CREATE TABLE IF NOT EXISTS "datavault_values" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "row_id" uuid NOT NULL,
  "column_id" uuid NOT NULL,
  "value" jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- =====================================================================
-- ADD FOREIGN KEY CONSTRAINTS
-- =====================================================================

-- DataVault Tables foreign keys
DO $$ BEGIN
  ALTER TABLE "datavault_tables" ADD CONSTRAINT "datavault_tables_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "datavault_tables" ADD CONSTRAINT "datavault_tables_owner_user_id_users_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- DataVault Columns foreign keys
DO $$ BEGIN
  ALTER TABLE "datavault_columns" ADD CONSTRAINT "datavault_columns_table_id_datavault_tables_id_fk"
  FOREIGN KEY ("table_id") REFERENCES "public"."datavault_tables"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- DataVault Rows foreign keys
DO $$ BEGIN
  ALTER TABLE "datavault_rows" ADD CONSTRAINT "datavault_rows_table_id_datavault_tables_id_fk"
  FOREIGN KEY ("table_id") REFERENCES "public"."datavault_tables"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "datavault_rows" ADD CONSTRAINT "datavault_rows_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "datavault_rows" ADD CONSTRAINT "datavault_rows_updated_by_users_id_fk"
  FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- DataVault Values foreign keys
DO $$ BEGIN
  ALTER TABLE "datavault_values" ADD CONSTRAINT "datavault_values_row_id_datavault_rows_id_fk"
  FOREIGN KEY ("row_id") REFERENCES "public"."datavault_rows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "datavault_values" ADD CONSTRAINT "datavault_values_column_id_datavault_columns_id_fk"
  FOREIGN KEY ("column_id") REFERENCES "public"."datavault_columns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =====================================================================
-- CREATE INDICES
-- =====================================================================

-- DataVault Tables indices
CREATE INDEX IF NOT EXISTS "datavault_tables_tenant_idx" ON "datavault_tables" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "datavault_tables_owner_idx" ON "datavault_tables" USING btree ("owner_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "datavault_tables_tenant_slug_unique" ON "datavault_tables" USING btree ("tenant_id", "slug");

-- DataVault Columns indices
CREATE INDEX IF NOT EXISTS "datavault_columns_table_idx" ON "datavault_columns" USING btree ("table_id");
CREATE UNIQUE INDEX IF NOT EXISTS "datavault_columns_table_slug_unique" ON "datavault_columns" USING btree ("table_id", "slug");

-- DataVault Rows indices
CREATE INDEX IF NOT EXISTS "datavault_rows_table_idx" ON "datavault_rows" USING btree ("table_id");
CREATE INDEX IF NOT EXISTS "datavault_rows_created_by_idx" ON "datavault_rows" USING btree ("created_by");

-- DataVault Values indices
CREATE INDEX IF NOT EXISTS "datavault_values_row_idx" ON "datavault_values" USING btree ("row_id");
CREATE INDEX IF NOT EXISTS "datavault_values_column_idx" ON "datavault_values" USING btree ("column_id");
CREATE UNIQUE INDEX IF NOT EXISTS "datavault_values_row_column_unique" ON "datavault_values" USING btree ("row_id", "column_id");

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================

-- Migration complete. DataVault Phase 1 schema is ready for use.
-- Next steps: Implement repositories, services, and API routes.
