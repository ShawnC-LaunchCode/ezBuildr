/**
 * Script to check project-workflow relationships in the database
 * Run with: npx tsx scripts/checkProjectWorkflows.ts
 */

import { getDb, initializeDatabase } from '../server/db';
import { projects, workflows } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function checkProjectWorkflows() {
  try {
    await initializeDatabase();
    const db = getDb();

    console.log('Fetching all projects...');
    const allProjects = await db.select().from(projects);
    console.log(`Found ${allProjects.length} projects:\n`);

    for (const project of allProjects) {
      console.log(`Project: ${project.title} (ID: ${project.id})`);
      console.log(`  Created by: ${project.createdBy}`);
      console.log(`  Status: ${project.status}`);

      // Find workflows for this project
      const projectWorkflows = await db
        .select()
        .from(workflows)
        .where(eq(workflows.projectId, project.id));

      console.log(`  Workflows in this project: ${projectWorkflows.length}`);

      if (projectWorkflows.length > 0) {
        projectWorkflows.forEach(wf => {
          console.log(`    - ${wf.title} (ID: ${wf.id})`);
          console.log(`      Status: ${wf.status}, Creator: ${wf.creatorId}`);
        });
      }
      console.log('');
    }

    console.log('\n--- Checking all workflows ---');
    const allWorkflows = await db.select().from(workflows);
    console.log(`Total workflows: ${allWorkflows.length}`);

    const withProject = allWorkflows.filter(wf => wf.projectId !== null);
    const withoutProject = allWorkflows.filter(wf => wf.projectId === null);

    console.log(`Workflows WITH projectId: ${withProject.length}`);
    console.log(`Workflows WITHOUT projectId: ${withoutProject.length}\n`);

    if (withProject.length > 0) {
      console.log('Workflows with projects:');
      withProject.forEach(wf => {
        console.log(`  - ${wf.title} -> Project ID: ${wf.projectId}`);
      });
    }

    if (withoutProject.length > 0) {
      console.log('\nWorkflows without projects:');
      withoutProject.forEach(wf => {
        console.log(`  - ${wf.title} (ID: ${wf.id})`);
      });
    }

  } catch (error) {
    console.error('Error checking project workflows:', error);
  } finally {
    process.exit(0);
  }
}

checkProjectWorkflows();
