import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const client = neon(process.env.DATABASE_URL!);

  const workflowId = process.argv[2] || '111c7d31-bef1-4b9d-909e-0113cbb481fb';
  const userId = process.argv[3]; // Optional - will auto-detect if not provided

  console.log(`🔍 Checking access for workflow: ${workflowId}\n`);

  // Get workflow details
  const workflows = await client`
    SELECT w.id, w.title, w.project_id, w.creator_id, w.owner_id, p.name as project_name
    FROM workflows w
    LEFT JOIN projects p ON w.project_id = p.id
    WHERE w.id = ${workflowId}
  `;

  if (workflows.length === 0) {
    console.log('❌ Workflow not found');
    return;
  }

  const workflow = workflows[0];
  console.log('📊 Workflow Details:');
  console.log(`   Title: ${workflow.title}`);
  console.log(`   Project: ${workflow.project_name || 'NULL'} (${workflow.project_id || 'NULL'})`);
  console.log(`   Creator: ${workflow.creator_id}`);
  console.log(`   Owner: ${workflow.owner_id}`);
  console.log('');

  // Determine the user to check
  const targetUserId = userId || workflow.creator_id;
  console.log(`👤 Checking access for user: ${targetUserId}\n`);

  // Check if user has direct workflow access
  const workflowAccess = await client`
    SELECT role
    FROM workflow_access
    WHERE workflow_id = ${workflowId} AND principal_type = 'user' AND principal_id = ${targetUserId}
  `;

  if (workflowAccess.length > 0) {
    console.log(`✅ User has direct workflow access: ${workflowAccess[0].role}`);
  } else {
    console.log('⚠️  No direct workflow access found');
  }

  // Check if user has project access
  if (workflow.project_id) {
    const projectAccess = await client`
      SELECT role
      FROM project_access
      WHERE project_id = ${workflow.project_id} AND principal_type = 'user' AND principal_id = ${targetUserId}
    `;

    if (projectAccess.length > 0) {
      console.log(`✅ User has project access: ${projectAccess[0].role}`);
    } else {
      console.log('⚠️  No project access found');
    }
  }

  // Check if user is the owner
  const isOwner = workflow.owner_id === targetUserId || workflow.creator_id === targetUserId;
  console.log(`${isOwner ? '✅' : '⚠️ '} User is ${isOwner ? '' : 'NOT '}the owner/creator`);
  console.log('');

  // Fix: Grant owner access
  if (isOwner && workflow.project_id) {
    console.log('🔧 Granting owner access to project...');

    // Check if access already exists
    const existingAccess = await client`
      SELECT id FROM project_access
      WHERE project_id = ${workflow.project_id} AND principal_type = 'user' AND principal_id = ${targetUserId}
    `;

    if (existingAccess.length === 0) {
      await client`
        INSERT INTO project_access (project_id, principal_type, principal_id, role)
        VALUES (${workflow.project_id}, 'user', ${targetUserId}, 'owner')
      `;
      console.log('✅ Granted owner access to project');
    } else {
      // Update to owner role if not already
      await client`
        UPDATE project_access
        SET role = 'owner'
        WHERE project_id = ${workflow.project_id} AND principal_type = 'user' AND principal_id = ${targetUserId}
      `;
      console.log('✅ Updated to owner role');
    }
  }

  // Verify access
  console.log('\n📋 Final Access Check:');

  if (workflow.project_id) {
    const finalAccess = await client`
      SELECT role FROM project_access
      WHERE project_id = ${workflow.project_id} AND principal_type = 'user' AND principal_id = ${targetUserId}
    `;

    if (finalAccess.length > 0) {
      console.log(`✅ User has ${finalAccess[0].role} access to the project`);
      console.log('✅ User should now have access to the workflow!');
    } else {
      console.log('❌ Still no access - may need to check ACL service logic');
    }
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
