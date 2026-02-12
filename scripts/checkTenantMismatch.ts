import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const client = neon(process.env.DATABASE_URL!);
  const workflowId = '111c7d31-bef1-4b9d-909e-0113cbb481fb';
  const userId = '116568744155653496130';

  console.log('=== Tenant Mismatch Check ===\n');

  // Get workflow with project info
  const workflows = await client`
    SELECT w.id, w.title, w.project_id, p.tenant_id as project_tenant_id, p.name as project_name
    FROM workflows w
    LEFT JOIN projects p ON w.project_id = p.id
    WHERE w.id = ${workflowId}
  `;

  if (workflows.length === 0) {
    console.log('❌ Workflow not found');
    return;
  }

  const workflow = workflows[0];
  console.log('Workflow:', workflow);
  console.log('');

  // Get user's tenant info
  const users = await client`
    SELECT id, email, tenant_id, tenant_role
    FROM users
    WHERE id = ${userId}
  `;

  if (users.length === 0) {
    console.log('❌ User not found');
    return;
  }

  const user = users[0];
  console.log('User:', user);
  console.log('');

  // Check for mismatch
  console.log('=== Mismatch Analysis ===');
  console.log(`Workflow's Project Tenant: ${workflow.project_tenant_id}`);
  console.log(`User's Tenant: ${user.tenant_id}`);
  console.log(`Match: ${workflow.project_tenant_id === user.tenant_id}`);

  if (workflow.project_tenant_id !== user.tenant_id) {
    console.log('\n⚠️  TENANT MISMATCH DETECTED!');
    console.log('This is why the RBAC route is returning 403.');
    console.log('The workflow belongs to a different tenant than the user.');
  } else {
    console.log('\n✅ Tenants match');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
  })
  .finally(() => process.exit(0));
