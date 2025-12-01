/**
 * Setup test template and link it to the test workflow
 */

import { initializeDatabase, getDb } from '../server/db';
import { templates, sections, workflows } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

async function setupTestTemplate() {
  await initializeDatabase();
  const db = getDb();

  // Find the test workflow we just created
  const workflowList = await db
    .select()
    .from(workflows)
    .where(eq(workflows.title, 'Simple Document Test'))
    .orderBy(workflows.createdAt)
    .limit(1);

  if (workflowList.length === 0) {
    console.log('Test workflow not found. Run createTestWorkflow.ts first.');
    return;
  }

  const workflow = workflowList[0];
  console.log('Found workflow:', workflow.id);

  // Check if testDoc.docx exists
  const testDocPath = path.join(process.cwd(), 'testDoc.docx');
  if (!fs.existsSync(testDocPath)) {
    console.log('testDoc.docx not found in root directory');
    return;
  }

  console.log('Found testDoc.docx');

  // Copy the test document to the uploads/templates directory
  const templatesDir = path.join(process.cwd(), 'server', 'files', 'templates');
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }

  const templateFileName = `test-template-${Date.now()}.docx`;
  const templatePath = path.join(templatesDir, templateFileName);
  fs.copyFileSync(testDocPath, templatePath);
  console.log('Copied template to:', templatePath);

  // Create template record in database
  const template = await db.insert(templates).values({
    id: randomUUID(),
    projectId: workflow.projectId!,
    name: 'Welcome Letter',
    description: 'Simple welcome letter template',
    fileRef: `templates/${templateFileName}`,
    type: 'docx',
  }).returning();

  console.log('Template created:', template[0].id);

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

  // Update the section config to include the template
  const config = finalSection.config as any;
  config.templates = [template[0].id];

  await db
    .update(sections)
    .set({ config })
    .where(eq(sections.id, finalSection.id));

  console.log('Updated section config with template ID');

  console.log('\n=== Setup Complete ===');
  console.log('Workflow ID:', workflow.id);
  console.log('Template ID:', template[0].id);
  console.log('Public Link:', `http://localhost:5000/run/${workflow.publicLink}`);
  console.log('Direct Run Link:', `http://localhost:5000/run/${workflow.id}`);
  console.log('\nYou can now test the workflow!');

  process.exit(0);
}

setupTestTemplate().catch(console.error);
