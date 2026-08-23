/**
 * Debug script to investigate workflow structure
 */

import { eq } from 'drizzle-orm';

import { workflowRuns, pages, workflows, templates } from '@shared/schema';

import { initializeDatabase, getDb } from '../server/db';

async function debugWorkflow() {
  // Initialize database first
  await initializeDatabase();
  const db = getDb();

  const runId = 'd1337e97-ad88-4761-89e0-3c7884e09f35';

  // Get the run
  const run = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1);

  if (run.length === 0) {
    console.log('Run not found');
    return;
  }

  const workflowId = run[0].workflowId;
  console.log('Run found:', {
    id: run[0].id,
    workflowId,
    completed: run[0].completed,
    currentPageId: run[0].currentPageId,
  });

  // Get workflow details
  const workflow = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
  console.log('\nWorkflow:', {
    id: workflow[0].id,
    title: workflow[0].title,
    status: workflow[0].status,
  });

  // Get pages
  const pageList = await db.select().from(pages).where(eq(pages.workflowId, workflowId));
  console.log('\nPages:', pageList.length);

  for (const page of pageList) {
    const config = page.config as Record<string, unknown>;
    const isFinalDocs = config?.finalBlock === true;

    console.log(`  - ${page.title} (order: ${page.order})`);
    console.log(`    ID: ${page.id}`);
    console.log(`    Final Docs: ${isFinalDocs}`);

    if (isFinalDocs) {
      console.log(`    Templates: ${JSON.stringify(config?.templates ?? [])}`);
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      console.log(`    Screen Title: ${config?.screenTitle ?? 'N/A'}`);
    }
  }

  // Get all templates for this workflow
  // Templates are linked to project, not workflow, so we need to get the project first
  const projectId = workflow[0].projectId;
  const templateList = projectId ? await db.select().from(templates).where(eq(templates.projectId, projectId)) : [];
  console.log('\nDocument Templates:', templateList.length);

  for (const template of templateList) {
    console.log(`  - ${template.name}`);
    console.log(`    ID: ${template.id}`);
    console.log(`    File: ${template.fileRef}`);
  }

  process.exit(0);
}

debugWorkflow().catch((error: unknown) => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
});
