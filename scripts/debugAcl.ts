import dotenv from 'dotenv';

import { initializeDatabase } from '../server/db';
import { workflowRepository } from '../server/repositories';
import { aclService } from '../server/services/AclService';


dotenv.config();

async function main() {
  await initializeDatabase();
  const workflowId = '111c7d31-bef1-4b9d-909e-0113cbb481fb';
  const userId = '116568744155653496130';

  console.log('=== ACL Debug Test ===\n');
  console.log(`Workflow ID: ${workflowId}`);
  console.log(`User ID: ${userId}\n`);

  // Get workflow directly
  const workflow = await workflowRepository.findById(workflowId);
  console.log('Workflow from DB:');
  console.log(JSON.stringify(workflow, null, 2));
  console.log('');

  if (workflow) {
    console.log(`workflow.ownerId type: ${typeof workflow.ownerId}`);
    console.log(`workflow.ownerId value: "${workflow.ownerId}"`);
    console.log(`userId type: ${typeof userId}`);
    console.log(`userId value: "${userId}"`);
    console.log(`Direct comparison: ${workflow.ownerId === userId}`);
    // eslint-disable-next-line eqeqeq
    console.log(`Loose comparison: ${workflow.ownerId == userId}`);
    console.log('');
  }

  // Test ACL resolution
  console.log('Testing ACL resolution...\n');
  const role = await aclService.resolveRoleForWorkflow(userId, workflowId);
  console.log(`Resolved role: ${role}\n`);

  // Test hasWorkflowRole
  const hasView = await aclService.hasWorkflowRole(userId, workflowId, 'view');
  console.log(`Has view access: ${hasView}`);
}

main().catch((error: unknown) => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
}).finally(() => process.exit(0));
