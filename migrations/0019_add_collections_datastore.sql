-- =====================================================================
-- Migration 0018: Stage 19 - Collections / Datastore System
-- =====================================================================
-- This migration creates the Collections/Datastore system that allows:
-- - Tenants to create data tables (Collections)
-- - Define fields in each Collection
-- - Create, read, update, delete (CRUD) records
-- - Use Collections inside workflows (CreateRecord, UpdateRecord, FindRecord nodes)
-- - Populate Intake forms from records (prefill)
-- - Store Intake submissions as records when configured
--
-- Similar to: Airtable bases, Retool resources, Afterpattern collections, Notion databases

-- Step 1: Create collection_field_type enum
DO $$ BEGIN
  CREATE TYPE collection_field_type AS ENUM (
    'text',
    'number',
    'boolean',
    'date',
    'datetime',
    'file',
    'select',
    'multi_select',
    'json'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 2: Create collections table
CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 3: Create collection_fields table
CREATE TABLE IF NOT EXISTS collection_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  type collection_field_type NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT false,
  options JSONB, -- For select/multi-select field types (array of options)
  default_value JSONB, -- Default value for this field
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 4: Create records table
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb, -- Stores fieldSlug → value map
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Step 5: Create indexes for collections
CREATE INDEX IF NOT EXISTS collections_tenant_idx ON collections(tenant_id);
CREATE INDEX IF NOT EXISTS collections_slug_idx ON collections(slug);
CREATE UNIQUE INDEX IF NOT EXISTS collections_tenant_slug_unique_idx ON collections(tenant_id, slug);
CREATE INDEX IF NOT EXISTS collections_created_at_idx ON collections(created_at);

-- Step 6: Create indexes for collection_fields
CREATE INDEX IF NOT EXISTS collection_fields_collection_idx ON collection_fields(collection_id);
CREATE INDEX IF NOT EXISTS collection_fields_slug_idx ON collection_fields(slug);
CREATE UNIQUE INDEX IF NOT EXISTS collection_fields_collection_slug_unique_idx ON collection_fields(collection_id, slug);
CREATE INDEX IF NOT EXISTS collection_fields_type_idx ON collection_fields(type);

-- Step 7: Create indexes for records
CREATE INDEX IF NOT EXISTS records_tenant_idx ON records(tenant_id);
CREATE INDEX IF NOT EXISTS records_collection_idx ON records(collection_id);
CREATE INDEX IF NOT EXISTS records_created_at_idx ON records(created_at);
CREATE INDEX IF NOT EXISTS records_created_by_idx ON records(created_by);
CREATE INDEX IF NOT EXISTS records_data_gin_idx ON records USING GIN(data);

-- Step 8: Add comments for documentation
COMMENT ON TABLE collections IS 'Stage 19: Collections/Datastore - Tenant-scoped data tables similar to Airtable bases';
COMMENT ON TABLE collection_fields IS 'Stage 19: Field definitions for collections with type validation and constraints';
COMMENT ON TABLE records IS 'Stage 19: Records stored in collections with schemaless JSONB data';

COMMENT ON COLUMN collections.slug IS 'URL-safe unique identifier within tenant scope';
COMMENT ON COLUMN collection_fields.type IS 'Field data type: text, number, boolean, date, datetime, file, select, multi_select, json';
COMMENT ON COLUMN collection_fields.options IS 'For select/multi-select types: array of valid options';
COMMENT ON COLUMN collection_fields.default_value IS 'Default value applied when creating new records';
COMMENT ON COLUMN records.data IS 'Schemaless JSONB storing fieldSlug → value map, validated against collection_fields';
