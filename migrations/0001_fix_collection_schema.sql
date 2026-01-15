-- Fix collection schema to match expected structure

-- Add collection_field_type enum
CREATE TYPE "public"."collection_field_type" AS ENUM('text', 'number', 'boolean', 'date', 'datetime', 'file', 'select', 'multi_select', 'json');

-- Rename required column to is_required in collection_fields
ALTER TABLE "collection_fields" RENAME COLUMN "required" TO "is_required";

-- Update type column to use enum instead of varchar
ALTER TABLE "collection_fields" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "collection_fields" ALTER COLUMN "type" TYPE "public"."collection_field_type" USING "type"::"public"."collection_field_type";

-- Add default_value column to collection_fields
ALTER TABLE "collection_fields" ADD COLUMN IF NOT EXISTS "default_value" jsonb;

-- Add missing indexes
CREATE INDEX IF NOT EXISTS "collection_fields_slug_idx" ON "collection_fields" USING btree ("slug");
CREATE INDEX IF NOT EXISTS "collection_fields_type_idx" ON "collection_fields" USING btree ("type");
