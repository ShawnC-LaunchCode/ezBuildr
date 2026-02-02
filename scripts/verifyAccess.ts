import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const client = neon(process.env.DATABASE_URL!);
  const workflowId = '111c7d31-bef1-4b9d-909e-0113cbb481fb';
  const userId = '116568744155653496130';
  const userTenantId = '15f19932-cda8-4294-a8e2-851fe4a1a2ad';

  console.log('=== Verifying Access ===\n');

  // Get workflow with project
  const workflows = await client`
    SELECT
      w.id,
      w.title,
      w.owner_id,
      w.project_id,
      p.name as project_name,
      p.tenant_id as project_tenant_id
    FROM workflows w
    LEFT JOIN projects p ON w.project_id = p.id
    WHERE w.id = ${workflowId}
  `;

  if (workflows.length === 0) {
    console.log('❌ Workflow not found');
    return;
  }

  const workflow = workflows[0];

  console.log('Workflow Info:');
  console.log(`  Title: ${workflow.title}`);
  console.log(`  Owner: ${workflow.owner_id}`);
  console.log(`  Project: ${workflow.project_name}`);
  console.log(`  Project Tenant: ${workflow.project_tenant_id}\n`);

  console.log('User Info:');
  console.log(`  User ID: ${userId}`);
  console.log(`  User Tenant: ${userTenantId}\n`);

  console.log('Access Checks:');

  // Check 1: Is user the owner?
  const isOwner = workflow.owner_id === userId;
  console.log(`  ✓ User is owner: ${isOwner ? '✅ YES' : '❌ NO'}`);

  // Check 2: Do tenants match?
  const tenantMatch = workflow.project_tenant_id === userTenantId;
  console.log(`  ✓ Tenant match: ${tenantMatch ? '✅ YES' : '❌ NO'}`);

  // Check 3: Get user's role
  const users = await client`
    SELECT tenant_role FROM users WHERE id = ${userId}
  `;
  const userRole = users[0]?.tenant_role;
  console.log(`  ✓ User role: ${userRole}`);

  // Check 4: Does role have workflow:view permission?
  const rolePermissions: Record<string, string[]> = {
    owner: ['*'],
    builder: ['workflow:view', 'workflow:edit', 'workflow:create'],
    runner: ['workflow:view', 'workflow:run'],
    viewer: ['workflow:view'],
  };
  const hasViewPermission = rolePermissions[userRole]?.includes('workflow:view') || rolePermissions[userRole]?.includes('*');
  console.log(`  ✓ Has workflow:view permission: ${hasViewPermission ? '✅ YES' : '❌ NO'}\n`);

  console.log('Final Verdict:');
  if (isOwner && tenantMatch && hasViewPermission) {
    console.log('✅ User SHOULD have access to this workflow');
    console.log('\nIf you\'re still getting 403, try:');
    console.log('  1. Hard refresh browser (Ctrl+F5)');
    console.log('  2. Clear browser cache');
    console.log('  3. Try incognito window');
    console.log('  4. Check server console for error logs');
  } else {
    console.log('❌ User does NOT have access');
    console.log('Issues:');
    if (!isOwner) {console.log('  - User is not the workflow owner');}
    if (!tenantMatch) {console.log('  - Tenant mismatch');}
    if (!hasViewPermission) {console.log('  - User role lacks workflow:view permission');}
  }
}

main().catch(console.error).finally(() => process.exit(0));
