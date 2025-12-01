/**
 * Debug script to investigate workflow structure
 */

import { initializeDatabase, getDb } from '../server/db';
import { workflowRuns, sections, workflows, templates } from '@shared/schema';
import { eq } from 'drizzle-orm';

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
    currentSectionId: run[0].currentSectionId,
  });

  // Get workflow details
  const workflow = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
  console.log('\nWorkflow:', {
    id: workflow[0].id,
    title: workflow[0].title,
    status: workflow[0].status,
  });

  // Get sections
  const sectionList = await db.select().from(sections).where(eq(sections.workflowId, workflowId));
  console.log('\nSections:', sectionList.length);

  for (const section of sectionList) {
    const config = section.config as any;
    const isFinalDocs = config?.finalBlock === true;

    console.log(`  - ${section.title} (order: ${section.order})`);
    console.log(`    ID: ${section.id}`);
    console.log(`    Final Docs: ${isFinalDocs}`);

    if (isFinalDocs) {
      console.log(`    Templates: ${JSON.stringify(config?.templates || [])}`);
      console.log(`    Screen Title: ${config?.screenTitle || 'N/A'}`);
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

debugWorkflow().catch(console.error);
