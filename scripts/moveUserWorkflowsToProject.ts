/**
 * Move user's workflows from Default Project to their own project
 * Run with: npx tsx scripts/moveUserWorkflowsToProject.ts
 */

import { getDb, initializeDatabase } from '../server/db';
import { workflows, projects } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const USER_ID = '116568744155653496130'; // Your user ID
const DEFAULT_PROJECT_ID = 'f94a5b56-a836-4454-82e0-83c0e2495a31';
const BIG_PROJECT_ID = '0f87dbef-6d5d-4726-8216-84f1ed462d0b';

async function moveWorkflows() {
  try {
    await initializeDatabase();
    const db = getDb();

    console.log('Finding workflows to move...\n');

    // Find workflows created by the user in the Default Project
    const userWorkflowsInDefault = await db
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.creatorId, USER_ID),
          eq(workflows.projectId, DEFAULT_PROJECT_ID)
        )
      );

    console.log(`Found ${userWorkflowsInDefault.length} workflows to move:\n`);
    userWorkflowsInDefault.forEach(wf => {
      console.log(`  - ${wf.title} (ID: ${wf.id})`);
    });

    if (userWorkflowsInDefault.length === 0) {
      console.log('\nNo workflows to move. All done!');
      return;
    }

    console.log(`\nMoving workflows to "big project"...`);

    for (const workflow of userWorkflowsInDefault) {
      await db
        .update(workflows)
        .set({ projectId: BIG_PROJECT_ID, updatedAt: new Date() })
        .where(eq(workflows.id, workflow.id));

      console.log(`  ✓ Moved "${workflow.title}"`);
    }

    console.log('\n✓ All workflows moved successfully!\n');

    // Verify
    console.log('Verifying...');
    const bigProjectWorkflows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, BIG_PROJECT_ID));

    console.log(`\nWorkflows in "big project": ${bigProjectWorkflows.length}`);
    bigProjectWorkflows.forEach(wf => {
      console.log(`  - ${wf.title}`);
    });

  } catch (error) {
    console.error('Error moving workflows:', error);
  } finally {
    process.exit(0);
  }
}

moveWorkflows();
