/**
 * Link the loan application template to the workflow
 */

import { initializeDatabase, getDb } from '../server/db';
import { templates, sections, workflows } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

async function linkLoanTemplate() {
  await initializeDatabase();
  const db = getDb();

  // Find the loan application workflow
  const workflowList = await db
    .select()
    .from(workflows)
    .where(eq(workflows.title, 'Personal Loan Application'))
    .orderBy(workflows.createdAt)
    .limit(1);

  if (workflowList.length === 0) {
    console.log('Loan application workflow not found');
    return;
  }

  const workflow = workflowList[0];
  console.log('Found workflow:', workflow.id);
  console.log('Title:', workflow.title);

  // Create template record
  const template = await db.insert(templates).values({
    id: randomUUID(),
    projectId: workflow.projectId!,
    name: 'Loan Application Summary',
    description: 'Professional loan application summary with applicant details and financial analysis',
    fileRef: 'templates/loan-application-summary.docx',
    type: 'docx',
  }).returning();

  console.log('\nTemplate created:', template[0].id);

  // Find the Final Documents section
  const sectionList = await db
    .select()
    .from(sections)
    .where(eq(sections.workflowId, workflow.id))
    .orderBy(sections.order);

  const finalSection = sectionList.find((s) => {
    const config = s.config as any;
    return config?.finalBlock === true;
  });

  if (!finalSection) {
    console.log('Final Documents section not found');
    return;
  }

  console.log('Found Final Documents section:', finalSection.id);

  // Update section config to include the template
  const config = finalSection.config as any;
  config.templates = [template[0].id];

  await db
    .update(sections)
    .set({ config })
    .where(eq(sections.id, finalSection.id));

  console.log('Updated section config with template');

  console.log('\n=== Setup Complete ===');
  console.log('Workflow ID:', workflow.id);
  console.log('Template ID:', template[0].id);
  console.log('\nPublic Link:', `http://localhost:5000/run/${workflow.publicLink}`);
  console.log('Direct Link:', `http://localhost:5000/run/${workflow.id}`);
  console.log('\n=== Ready to Test! ===');
  console.log('\nThe workflow includes:');
  console.log('  [x] 4 sections with 14+ steps');
  console.log('  [x] Conditional visibility logic');
  console.log('  [x] JavaScript transform block for DTI calculation');
  console.log('  [x] Professional document template');
  console.log('  [x] Automatic document generation on final page');

  process.exit(0);
}

linkLoanTemplate().catch(console.error);
