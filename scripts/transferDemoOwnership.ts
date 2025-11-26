/**
 * Transfer Demo Workflow Ownership
 * Transfers ownership of the Fee Waiver demo workflow and project to a specific user
 */

import { getDb, initializeDatabase } from '../server/db';
import { users, projects, workflows } from '../shared/schema';
import { eq } from 'drizzle-orm';
import logger from '../server/logger';

async function transferOwnership(targetEmail: string, workflowId: string) {
  try {
    await initializeDatabase();
    const db = getDb();

    // Find the target user
    const targetUser = await db.query.users.findFirst({
      where: eq(users.email, targetEmail),
    });

    if (!targetUser) {
      throw new Error(`User not found with email: ${targetEmail}`);
    }

    logger.info('Found target user', { userId: targetUser.id, email: targetUser.email });

    // Find the workflow
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, workflowId),
    });

    if (!workflow) {
      throw new Error(`Workflow not found with ID: ${workflowId}`);
    }

    logger.info('Found workflow', {
      workflowId: workflow.id,
      title: workflow.title,
      currentCreatorId: workflow.creatorId,
      currentOwnerId: workflow.ownerId,
    });

    // Find the project
    if (!workflow.projectId) {
      throw new Error('Workflow has no associated project');
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, workflow.projectId),
    });

    if (!project) {
      throw new Error(`Project not found with ID: ${workflow.projectId}`);
    }

    logger.info('Found project', {
      projectId: project.id,
      title: project.title,
      currentCreatorId: project.creatorId,
      currentOwnerId: project.ownerId,
    });

    // Transfer workflow ownership
    await db
      .update(workflows)
      .set({
        creatorId: targetUser.id,
        ownerId: targetUser.id,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId));

    logger.info('Updated workflow ownership', {
      workflowId,
      newOwnerId: targetUser.id
    });

    // Transfer project ownership
    await db
      .update(projects)
      .set({
        creatorId: targetUser.id,
        createdBy: targetUser.id,
        ownerId: targetUser.id,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, workflow.projectId));

    logger.info('Updated project ownership', {
      projectId: workflow.projectId,
      newOwnerId: targetUser.id
    });

    console.log('\n✅ Ownership Transfer Complete!\n');
    console.log('📋 Summary:');
    console.log(`  - Target User: ${targetUser.email} (${targetUser.id})`);
    console.log(`  - Project: ${project.title}`);
    console.log(`  - Workflow: ${workflow.title}`);
    console.log(`\n🔗 You can now access the workflow at:`);
    console.log(`     http://localhost:5000/workflows/${workflowId}/builder`);

    process.exit(0);
  } catch (error) {
    logger.error('Failed to transfer ownership', { error });
    console.error('\n❌ Error transferring ownership:', error);
    process.exit(1);
  }
}

// Main execution
const targetEmail = process.argv[2] || 'scooter4356@gmail.com';
const workflowId = process.argv[3] || '81a73b18-012d-458b-af05-5098eb75c753';

console.log(`\n🔄 Transferring ownership to: ${targetEmail}`);
console.log(`   Workflow ID: ${workflowId}\n`);

transferOwnership(targetEmail, workflowId);
