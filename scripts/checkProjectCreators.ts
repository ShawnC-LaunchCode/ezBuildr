/**
 * Script to check creator fields in projects table
 * Run with: npx tsx scripts/checkProjectCreators.ts
 */

import { getDb, initializeDatabase } from '../server/db';
import { projects } from '@shared/schema';

async function checkProjectCreators() {
  try {
    await initializeDatabase();
    const db = getDb();

    console.log('Fetching all projects with creator fields...\n');
    const allProjects = await db.select().from(projects);

    for (const project of allProjects) {
      console.log(`Project: ${project.title}`);
      console.log(`  ID: ${project.id}`);
      console.log(`  creatorId (legacy): ${project.creatorId}`);
      console.log(`  createdBy (new): ${project.createdBy}`);
      console.log(`  ownerId: ${project.ownerId}`);
      console.log('');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkProjectCreators();
