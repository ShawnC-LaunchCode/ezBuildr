/**
 * Assign Orphaned Workflows to Default Project
 *
 * This script finds workflows without a projectId and assigns them to a default project.
 * Run this after migrations to fix legacy workflows.
 *
 * Usage: npx tsx scripts/assignOrphanedWorkflows.ts
 */

import { initializeDatabase, getDb } from '../server/db.js';
import { workflows, projects, tenants } from '../shared/schema.js';
import { isNull, eq } from 'drizzle-orm';
import { logger } from '../server/logger.js';

async function main() {
  logger.info('Starting orphaned workflows assignment...');

  try {
    // Initialize database connection
    await initializeDatabase();
    const db = getDb();

    // 1. Find workflows without a projectId
    const orphanedWorkflows = await db
      .select()
      .from(workflows)
      .where(isNull(workflows.projectId));

    if (orphanedWorkflows.length === 0) {
      logger.info('No orphaned workflows found. All workflows have a projectId.');
      return;
    }

    logger.info({ count: orphanedWorkflows.length }, 'Found orphaned workflows');

    // 2. Group workflows by creatorId
    const workflowsByCreator = orphanedWorkflows.reduce((acc, workflow) => {
      const creatorId = workflow.creatorId;
      if (!acc[creatorId]) {
        acc[creatorId] = [];
      }
      acc[creatorId].push(workflow);
      return acc;
    }, {} as Record<string, typeof orphanedWorkflows>);

    // 3. For each creator, create or find a default project
    for (const [creatorId, creatorWorkflows] of Object.entries(workflowsByCreator)) {
      logger.info({ creatorId, workflowCount: creatorWorkflows.length }, 'Processing creator workflows');

      // Find or create default tenant for this user
      let tenant = await db.query.tenants.findFirst({
        where: eq(tenants.ownerId, creatorId),
      });

      if (!tenant) {
        logger.info({ creatorId }, 'Creating default tenant for user');
        await db.insert(tenants).values({
          ownerId: creatorId,
          name: 'Default Workspace',
          slug: `user-${creatorId.substring(0, 8)}`,
        });

        tenant = await db.query.tenants.findFirst({
          where: eq(tenants.ownerId, creatorId),
        });
      }

      // Find or create default project for this tenant
      let project = await db.query.projects.findFirst({
        where: eq(projects.tenantId, tenant!.id),
      });

      if (!project) {
        logger.info({ tenantId: tenant!.id }, 'Creating default project for tenant');
        await db.insert(projects).values({
          tenantId: tenant!.id,
          name: 'Legacy Workflows',
          description: 'Workflows migrated from pre-project system',
          createdBy: creatorId,
        });

        project = await db.query.projects.findFirst({
          where: eq(projects.tenantId, tenant!.id),
        });
      }

      // Assign all workflows to this project
      logger.info({ projectId: project.id, count: creatorWorkflows.length }, 'Assigning workflows to project');

      for (const workflow of creatorWorkflows) {
        await db
          .update(workflows)
          .set({ projectId: project.id })
          .where(eq(workflows.id, workflow.id));
      }

      logger.info({ creatorId, projectId: project.id }, 'Successfully assigned workflows');
    }

    logger.info('Orphaned workflows assignment complete!');

    // Verify
    const remaining = await db
      .select()
      .from(workflows)
      .where(isNull(workflows.projectId));

    logger.info({ remaining: remaining.length }, 'Verification complete');

  } catch (error) {
    logger.error({ error: error instanceof Error ? { message: error.message, stack: error.stack } : error }, 'Failed to assign orphaned workflows');
    console.error('Full error:', error);
    throw error;
  }
}

main()
  .then(() => {
    logger.info('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error }, 'Script failed');
    process.exit(1);
  });
