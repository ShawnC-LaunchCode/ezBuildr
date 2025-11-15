#!/usr/bin/env tsx
/**
 * Fix sli_configs table creation
 * The original migration failed because "window" is a reserved keyword
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function fixSLIConfigsTable() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  console.log('🔧 Fixing sli_configs table (window is a reserved keyword)');
  console.log('');

  const client = neon(dbUrl);

  try {
    // Create the sli_configs table with quoted "window" column
    console.log('📝 Creating sli_configs table...');
    await client`
      CREATE TABLE IF NOT EXISTS sli_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
        target_success_pct INTEGER NOT NULL DEFAULT 99,
        target_p95_ms INTEGER NOT NULL DEFAULT 5000,
        error_budget_pct INTEGER NOT NULL DEFAULT 1,
        "window" sli_window NOT NULL DEFAULT '7d',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `;
    console.log('✅ Table created');

    // Create unique constraint
    console.log('📝 Creating unique constraint...');
    await client`
      CREATE UNIQUE INDEX IF NOT EXISTS sli_configs_unique_idx ON sli_configs(
        project_id,
        COALESCE(workflow_id, '00000000-0000-0000-0000-000000000000'::uuid)
      );
    `;
    console.log('✅ Unique constraint created');

    // Create indices
    console.log('📝 Creating indices...');
    await client`CREATE INDEX IF NOT EXISTS sli_configs_project_idx ON sli_configs(project_id);`;
    await client`CREATE INDEX IF NOT EXISTS sli_configs_workflow_idx ON sli_configs(workflow_id);`;
    await client`CREATE INDEX IF NOT EXISTS sli_configs_tenant_idx ON sli_configs(tenant_id);`;
    console.log('✅ Indices created');

    console.log('');
    console.log('✅ sli_configs table is now ready!');
    console.log('');
    console.log('🔄 Next steps:');
    console.log('   1. Restart your application server');
    console.log('   2. The SLI service should now work correctly');
    console.log('');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
    process.exit(1);
  }
}

fixSLIConfigsTable();
