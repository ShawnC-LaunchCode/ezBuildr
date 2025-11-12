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
    // CREATE INDICES
    // ===================================================================
    console.log('📋 Creating indices...');
    await client('CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id)');
    await client('CREATE INDEX IF NOT EXISTS projects_tenant_idx ON projects(tenant_id)');
    await client('CREATE INDEX IF NOT EXISTS projects_archived_idx ON projects(archived)');
    await client('CREATE INDEX IF NOT EXISTS workflows_project_idx ON workflows(project_id)');
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
