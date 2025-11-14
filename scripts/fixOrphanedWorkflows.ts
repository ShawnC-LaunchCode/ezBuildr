#!/usr/bin/env tsx
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function fixOrphanedWorkflows() {
  const client = neon(process.env.DATABASE_URL!);

  console.log('🔧 Fixing Orphaned Workflows...');
  console.log('');

  try {
    // Check for workflows without project_id
    const orphanedWorkflows = await client(`
      SELECT COUNT(*) as count FROM workflows WHERE project_id IS NULL
    `);

    if (orphanedWorkflows[0].count === 0) {
      console.log('✅ No orphaned workflows found. All workflows have project_id.');
      return;
    }

    console.log(`Found ${orphanedWorkflows[0].count} workflows without project_id`);
    console.log('');

    // Get or create default tenant
    let defaultTenant = await client('SELECT id FROM tenants LIMIT 1');
    let defaultTenantId;

    if (defaultTenant.length === 0) {
      console.log('Creating default tenant...');
      const newTenant = await client(`
        INSERT INTO tenants (name, plan)
        VALUES ('Default Organization', 'free')
        RETURNING id
      `);
      defaultTenantId = newTenant[0].id;
      console.log('✓ Default tenant created:', defaultTenantId);
    } else {
      defaultTenantId = defaultTenant[0].id;
      console.log('✓ Using existing tenant:', defaultTenantId);
    }

    // Get first user for ownership
    const firstUser = await client('SELECT id FROM users LIMIT 1');
    const firstUserId = firstUser.length > 0 ? firstUser[0].id : 'system';

    // Get or create default project
    let defaultProject = await client(`
      SELECT id FROM projects WHERE tenant_id = $1 LIMIT 1
    `, [defaultTenantId]);
    let defaultProjectId;

    if (defaultProject.length === 0) {
      console.log('Creating default project...');
      const newProject = await client(`
        INSERT INTO projects (title, name, tenant_id, description, creator_id, owner_id)
        VALUES ('Default Project', 'Default Project', $1, 'Auto-created project for orphaned workflows', $2, $3)
        RETURNING id
      `, [defaultTenantId, firstUserId, firstUserId]);
      defaultProjectId = newProject[0].id;
      console.log('✓ Default project created:', defaultProjectId);
    } else {
      defaultProjectId = defaultProject[0].id;
      console.log('✓ Using existing project:', defaultProjectId);
    }

    // Update workflows without project_id
    console.log('');
    console.log('Updating orphaned workflows...');
    const updated = await client(`
      UPDATE workflows
      SET project_id = $1
      WHERE project_id IS NULL
      RETURNING id
    `, [defaultProjectId]);

    console.log(`✓ Updated ${updated.length} workflows`);
    console.log('');
    console.log('✅ Cleanup completed successfully!');

  } catch (error: any) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

fixOrphanedWorkflows();
