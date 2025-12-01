/**
 * Test document generation for the most recent run
 */

import { initializeDatabase, getDb } from '../server/db';
import { workflowRuns } from '@shared/schema';
import { desc } from 'drizzle-orm';
import { documentGenerationService } from '../server/services/DocumentGenerationService';

async function testDocGeneration() {
  await initializeDatabase();
  const db = getDb();

  // Get the most recent run
  const runs = await db
    .select()
    .from(workflowRuns)
    .orderBy(desc(workflowRuns.createdAt))
    .limit(1);

  if (runs.length === 0) {
    console.log('No runs found');
    return;
  }

  const run = runs[0];
  console.log('Testing document generation for run:', run.id);
  console.log('Workflow ID:', run.workflowId);
  console.log('Completed:', run.completed);

  try {
    await documentGenerationService.generateDocumentsForRun(run.id);
    console.log('\n✅ Document generation successful!');
  } catch (error) {
    console.error('\n❌ Document generation failed:');
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
  }

  process.exit(0);
}

testDocGeneration().catch(console.error);
