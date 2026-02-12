import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const client = neon(process.env.DATABASE_URL!);

  // Get the specific workflow ID from command line or use a default
  const workflowId = process.argv[2] || 'f3df5c14-b036-498d-8f35-64bab2b2c3a0';

  console.log(`🔍 Checking workflow: ${workflowId}\n`);

  // Check the workflow
  const workflows = await client`
    SELECT id, title, project_id, creator_id
    FROM workflows
    WHERE id = ${workflowId}
  `;

  if (workflows.length === 0) {
    console.log('❌ Workflow not found');
    return;
  }

  const workflow = workflows[0];
  console.log('📊 Workflow Details:');
  console.log(`   Title: ${workflow.title}`);
  console.log(`   Project ID: ${workflow.project_id || 'NULL ❌'}`);
  console.log(`   Creator ID: ${workflow.creator_id}`);
  console.log('');

  if (workflow.project_id) {
    console.log('✅ Workflow is already associated with a project');

    // Check if project exists
    const projects = await client`SELECT id, name FROM projects WHERE id = ${workflow.project_id}`;
    if (projects.length > 0) {
      console.log(`   Project: ${projects[0].name} (${projects[0].id})`);
    } else {
      console.log('⚠️  Project not found! Need to reassign.');
      workflow.project_id = null; // Force reassignment
    }
  }

  if (!workflow.project_id) {
    console.log('⚠️  Workflow has no project. Assigning to default project...\n');

    // Get or create a default project
    let defaultProject = await client`
      SELECT id, name, tenant_id
      FROM projects
      WHERE archived = false
      ORDER BY created_at ASC
      LIMIT 1
    `;

    if (defaultProject.length === 0) {
      console.log('📝 No project found. Creating default project...');

      // Get or create tenant
      let tenant = await client`SELECT id FROM tenants LIMIT 1`;
      if (tenant.length === 0) {
        tenant = await client`
          INSERT INTO tenants (name, plan)
          VALUES ('Default Organization', 'free')
          RETURNING id
        `;
      }
      const tenantId = tenant[0].id;

      // Get first user
      const users = await client`SELECT id FROM users LIMIT 1`;
      const userId = users[0]?.id || 'system';

      // Create default project
      defaultProject = await client`
        INSERT INTO projects (name, tenant_id, created_by, owner_id, archived)
        VALUES ('Default Project', ${tenantId}, ${userId}, ${userId}, false)
        RETURNING id, name, tenant_id
      `;

      console.log(`✅ Created project: ${defaultProject[0].name}`);
    }

    const projectId = defaultProject[0].id;
    console.log(`📌 Assigning workflow to project: ${defaultProject[0].name} (${projectId})`);

    // Update workflow
    await client`
      UPDATE workflows
      SET project_id = ${projectId}
      WHERE id = ${workflowId}
    `;

    console.log('✅ Workflow updated successfully!');
    console.log('');

    // Verify
    const updated = await client`
      SELECT id, title, project_id
      FROM workflows
      WHERE id = ${workflowId}
    `;

    console.log('✅ Verification:');
    console.log(`   Workflow: ${updated[0].title}`);
    console.log(`   Project ID: ${updated[0].project_id}`);
  }

  console.log('\n✅ Done! You can now upload templates.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
});
