/**
 * Create a simple test workflow with document generation
 */

import { initializeDatabase, getDb } from '../server/db';
import { workflows, sections, steps, templates, projects, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

async function createTestWorkflow() {
  await initializeDatabase();
  const db = getDb();

  // Get the first user
  const userList = await db.select().from(users).limit(1);
  if (userList.length === 0) {
    console.log('No users found. Please create a user first.');
    return;
  }

  const user = userList[0];
  console.log('Using user:', user.email);

  // Get or create a project
  let project = await db.select().from(projects).where(eq(projects.createdBy, user.id)).limit(1);

  if (project.length === 0) {
    console.log('Creating new project...');
    const newProject = await db.insert(projects).values({
      id: randomUUID(),
      name: 'Test Project',
      description: 'Test project for document generation',
      createdBy: user.id,
      tenantId: user.id, // Use user ID as tenant ID for simplicity
    }).returning();
    project = newProject;
  }

  const projectId = project[0].id;
  console.log('Using project:', projectId);

  // Create a simple workflow
  console.log('Creating workflow...');
  const workflow = await db.insert(workflows).values({
    id: randomUUID(),
    title: 'Simple Document Test',
    description: 'A simple workflow to test document generation',
    projectId,
    creatorId: user.id, // Legacy field (required)
    ownerId: user.id,   // Legacy field (required)
    status: 'active',
    isPublic: true,
    publicLink: 'simple-doc-test-' + Date.now(),
  }).returning();

  const workflowId = workflow[0].id;
  console.log('Workflow created:', workflowId);
  console.log('Public link:', workflow[0].publicLink);

  // Create Section 1: Basic Info
  const section1 = await db.insert(sections).values({
    id: randomUUID(),
    workflowId,
    title: 'Basic Information',
    description: 'Enter your basic details',
    order: 1,
  }).returning();

  // Create steps for section 1
  await db.insert(steps).values([
    {
      id: randomUUID(),
      sectionId: section1[0].id,
      type: 'short_text',
      title: 'First Name',
      alias: 'firstName',
      required: true,
      order: 1,
    },
    {
      id: randomUUID(),
      sectionId: section1[0].id,
      type: 'short_text',
      title: 'Last Name',
      alias: 'lastName',
      required: true,
      order: 2,
    },
    {
      id: randomUUID(),
      sectionId: section1[0].id,
      type: 'short_text',
      title: 'Email',
      alias: 'email',
      required: false,
      order: 3,
    },
  ]);

  console.log('Section 1 created with 3 steps');

  // Create Section 2: Final Documents
  const section2 = await db.insert(sections).values({
    id: randomUUID(),
    workflowId,
    title: 'Your Documents',
    description: 'Download your generated documents',
    order: 2,
    config: {
      finalBlock: true,
      screenTitle: 'Documents Ready!',
      markdownMessage: '# Thank You!\n\nYour personalized documents have been generated and are ready for download below.',
      templates: [], // Will be updated after creating template
    },
  }).returning();

  console.log('Section 2 (Final Documents) created');

  console.log('\n=== Test Workflow Created Successfully ===');
  console.log('Workflow ID:', workflowId);
  console.log('Public Link:', `http://localhost:5000/run/${workflow[0].publicLink}`);
  console.log('Direct Run Link:', `http://localhost:5000/run/${workflowId}`);
  console.log('\nNext steps:');
  console.log('1. Upload a DOCX template with placeholders like {{firstName}}, {{lastName}}, {{email}}');
  console.log('2. Update the Final Documents section config with the template ID');
  console.log('3. Run the workflow and test document generation');

  process.exit(0);
}

createTestWorkflow().catch(console.error);
