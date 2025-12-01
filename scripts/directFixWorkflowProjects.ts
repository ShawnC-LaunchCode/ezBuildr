#!/usr/bin/env tsx
/**
 * Directly fix workflows missing project_id
 *
 * This script directly updates workflows that are missing project_id associations.
 *
 * Usage:
 *   npx tsx scripts/directFixWorkflowProjects.ts
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function directFix() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔧 VaultLogic - Direct Fix for Workflow-Project Association');
  console.log('');

  try {
    const client = neon(dbUrl);

    // Get orphaned workflows
    console.log('📊 Finding workflows without project association...');
    const orphanedWorkflows = await client`
      SELECT id, title, name
      FROM workflows
      WHERE project_id IS NULL
    `;

    console.log(`   Found ${orphanedWorkflows.length} workflows without project_id`);
    console.log('');

    if (orphanedWorkflows.length === 0) {
      console.log('✅ All workflows are already associated with projects!');
      return;
    }

    // Get or create default project
    console.log('🔍 Looking for default project...');
    let defaultProject = await client`
      SELECT id, name FROM projects
      ORDER BY created_at ASC
      LIMIT 1
    `;

    let projectId: string;

    if (defaultProject.length === 0) {
      console.log('   No projects found, creating default project...');

      // Get first user for ownership
      const firstUser = await client`SELECT id FROM users LIMIT 1`;
      const userId = firstUser[0]?.id || 'system';

      // Get or create default tenant
      let tenant = await client`SELECT id FROM tenants LIMIT 1`;
      let tenantId: string;

      if (tenant.length === 0) {
        console.log('   Creating default tenant...');
        const newTenant = await client`
          INSERT INTO tenants (name, plan)
          VALUES ('Default Organization', 'free')
          RETURNING id
        `;
        tenantId = newTenant[0].id as string;
      } else {
        tenantId = tenant[0].id as string;
      }

      const newProject = await client`
        INSERT INTO projects (name, tenant_id, created_by, owner_id)
        VALUES ('Default Project', ${tenantId}, ${userId}, ${userId})
        RETURNING id, name
      `;

      projectId = newProject[0].id as string;
      console.log(`   ✓ Created default project: ${newProject[0].name} (${projectId})`);
    } else {
      projectId = defaultProject[0].id as string;
      console.log(`   ✓ Using existing project: ${defaultProject[0].name} (${projectId})`);
    }

    console.log('');
    console.log('🔄 Updating orphaned workflows...');

    // Update each workflow
    for (const workflow of orphanedWorkflows) {
      await client`
        UPDATE workflows
        SET project_id = ${projectId}
        WHERE id = ${workflow.id}
      `;
      console.log(`   ✓ Updated: ${workflow.title || workflow.name || workflow.id}`);
    }

    console.log('');
    console.log('✅ All workflows are now associated with a project!');
    console.log('');
    console.log('🔄 Next steps:');
    console.log('   1. Restart your application server (if running)');
    console.log('   2. Try uploading a template again');
    console.log('   3. Template upload should now work!');
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('❌ Script failed:', error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    process.exit(1);
  }
}

directFix();
