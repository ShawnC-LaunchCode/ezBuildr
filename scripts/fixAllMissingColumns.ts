import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function fixAllMissingColumns() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }

  const client = neon(dbUrl);

  console.log('🔧 Applying comprehensive schema fixes...\n');

  try {
    // ===================================================================
    // TENANTS TABLE (must exist first for foreign keys)
    // ===================================================================
    console.log('📋 Creating tenants table if not exists...');
    await client(`
      CREATE TABLE IF NOT EXISTS tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(255) NOT NULL,
        billing_email varchar(255),
        plan varchar(50) DEFAULT 'free' NOT NULL,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    console.log('✓ Tenants table ready');

    // Create a default tenant if none exists
    const existingTenants = await client('SELECT COUNT(*) as count FROM tenants');
    if (existingTenants[0].count === '0') {
      console.log('📋 Creating default tenant...');
      await client(`
        INSERT INTO tenants (name, plan)
        VALUES ('Default Organization', 'free')
      `);
      console.log('✓ Default tenant created');
    }

    // Get the first tenant ID for migrations
    const defaultTenant = await client('SELECT id FROM tenants LIMIT 1');
    const defaultTenantId = defaultTenant[0].id;
    console.log(`✓ Using tenant ID: ${defaultTenantId}\n`);

    // ===================================================================
    // USERS TABLE
    // ===================================================================
    console.log('📋 Fixing users table...');
    await client('ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name varchar(255)');
    await client('ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name varchar(255)');
    await client('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name varchar(255)');
    await client('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url varchar(500)');
    await client('ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id uuid');

    // Update existing users to have the default tenant
    await client(`UPDATE users SET tenant_id = '${defaultTenantId}' WHERE tenant_id IS NULL`);
    console.log('✓ Users table fixed');

    // ===================================================================
    // PROJECTS TABLE
    // ===================================================================
    console.log('📋 Fixing projects table...');

    // Add columns
    await client('ALTER TABLE projects ADD COLUMN IF NOT EXISTS tenant_id uuid');
    await client('ALTER TABLE projects ADD COLUMN IF NOT EXISTS name varchar(255)');
    await client('ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false');

    // Copy title to name if name is null (for existing projects)
    await client("UPDATE projects SET name = title WHERE name IS NULL AND title IS NOT NULL");

    // Set default tenant for existing projects
    await client(`UPDATE projects SET tenant_id = '${defaultTenantId}' WHERE tenant_id IS NULL`);

    console.log('✓ Projects table fixed');

    // ===================================================================
    // WORKFLOWS TABLE
    // ===================================================================
    console.log('📋 Fixing workflows table...');

    // Add columns
    await client('ALTER TABLE workflows ADD COLUMN IF NOT EXISTS name varchar(255)');
    await client('ALTER TABLE workflows ADD COLUMN IF NOT EXISTS current_version_id uuid');
    await client('ALTER TABLE workflows ADD COLUMN IF NOT EXISTS project_id uuid');

    // Copy title to name if name is null (for existing workflows)
    await client("UPDATE workflows SET name = title WHERE name IS NULL AND title IS NOT NULL");

    console.log('✓ Workflows table fixed');

    // ===================================================================
    // STEPS TABLE
    // ===================================================================
    console.log('📋 Fixing steps table...');

    // Add is_virtual column for transform block virtual steps
    await client('ALTER TABLE steps ADD COLUMN IF NOT EXISTS is_virtual boolean DEFAULT false NOT NULL');

    console.log('✓ Steps table fixed');

    // ===================================================================
    // TRANSFORM_BLOCKS TABLE
    // ===================================================================
    console.log('📋 Fixing transform_blocks table...');

    // Create table if it doesn't exist
    await client(`
      CREATE TABLE IF NOT EXISTS transform_blocks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        section_id uuid REFERENCES sections(id) ON DELETE CASCADE,
        name varchar NOT NULL,
        language text NOT NULL,
        phase text NOT NULL DEFAULT 'onSectionSubmit',
        code text NOT NULL,
        input_keys text[] NOT NULL DEFAULT '{}',
        output_key varchar NOT NULL,
        virtual_step_id uuid REFERENCES steps(id) ON DELETE SET NULL,
        enabled boolean NOT NULL DEFAULT true,
        "order" integer NOT NULL DEFAULT 0,
        timeout_ms integer DEFAULT 1000,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);

    // Add missing columns if they don't exist
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS workflow_id uuid');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS section_id uuid');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS name varchar');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS language text');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS phase text DEFAULT \'onSectionSubmit\'');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS code text');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS input_keys text[] DEFAULT \'{}\'');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS output_key varchar');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS virtual_step_id uuid');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS "order" integer DEFAULT 0');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS timeout_ms integer DEFAULT 1000');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()');
    await client('ALTER TABLE transform_blocks ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()');

    console.log('✓ Transform_blocks table fixed');

    // ===================================================================
    // TRANSFORM_BLOCK_RUNS TABLE
    // ===================================================================
    console.log('📋 Fixing transform_block_runs table...');

    await client(`
      CREATE TABLE IF NOT EXISTS transform_block_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        block_id uuid NOT NULL REFERENCES transform_blocks(id) ON DELETE CASCADE,
        started_at timestamp NOT NULL DEFAULT now(),
        finished_at timestamp,
        status text NOT NULL,
        error_message text,
        output_sample jsonb,
        created_at timestamp DEFAULT now()
      )
    `);

    console.log('✓ Transform_block_runs table fixed');

    // ===================================================================
    // CREATE INDICES
    // ===================================================================
    console.log('📋 Creating indices...');
    await client('CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id)');
    await client('CREATE INDEX IF NOT EXISTS projects_tenant_idx ON projects(tenant_id)');
    await client('CREATE INDEX IF NOT EXISTS projects_archived_idx ON projects(archived)');
    await client('CREATE INDEX IF NOT EXISTS workflows_project_idx ON workflows(project_id)');
    await client('CREATE INDEX IF NOT EXISTS steps_is_virtual_idx ON steps(is_virtual)');
    await client('CREATE INDEX IF NOT EXISTS transform_blocks_workflow_idx ON transform_blocks(workflow_id)');
    await client('CREATE INDEX IF NOT EXISTS transform_blocks_workflow_order_idx ON transform_blocks(workflow_id, "order")');
    await client('CREATE INDEX IF NOT EXISTS transform_blocks_phase_idx ON transform_blocks(workflow_id, phase)');
    await client('CREATE INDEX IF NOT EXISTS transform_blocks_virtual_step_idx ON transform_blocks(virtual_step_id)');
    await client('CREATE INDEX IF NOT EXISTS transform_block_runs_run_idx ON transform_block_runs(run_id)');
    await client('CREATE INDEX IF NOT EXISTS transform_block_runs_block_idx ON transform_block_runs(block_id)');
    console.log('✓ Indices created');

    console.log('\n✅ All schema fixes applied successfully!');
    console.log('🔄 Please restart your dev server to pick up the changes.');

  } catch (error: any) {
    console.error('❌ Error fixing schema:', error.message);
    if (error.detail) console.error('Details:', error.detail);
    process.exit(1);
  }
}

fixAllMissingColumns();
