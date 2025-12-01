/**
 * Create loan application workflow for the current logged-in user
 */

import { initializeDatabase, getDb } from '../server/db';
import { workflows, sections, steps, templates, projects, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

async function createWorkflowForCurrentUser() {
  await initializeDatabase();
  const db = getDb();

  // Get the user with the specific Google ID from the error
  const targetUserId = '116568744155653496130';

  const userList = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);

  if (userList.length === 0) {
    console.log('User not found:', targetUserId);
    console.log('\nLet me check all users:');
    const allUsers = await db.select().from(users);
    console.log('Available users:', allUsers.map(u => ({ id: u.id, email: u.email })));
    return;
  }

  const user = userList[0];
  console.log('Found user:', user.email, 'ID:', user.id);

  // Get or create project
  let project = await db.select().from(projects).where(eq(projects.createdBy, user.id)).limit(1);

  if (project.length === 0) {
    console.log('Creating new project for user...');
    const newProject = await db.insert(projects).values({
      id: randomUUID(),
      name: 'My Workflows',
      description: 'Personal workflow collection',
      createdBy: user.id,
      creatorId: user.id,
      ownerId: user.id,
      tenantId: user.id,
    }).returning();
    project = newProject;
  }

  const projectId = project[0].id;
  console.log('Using project:', projectId);

  // Create simple test workflow
  console.log('\nCreating simple test workflow...');
  const workflow = await db.insert(workflows).values({
    id: randomUUID(),
    title: 'Quick Test Workflow',
    description: 'Simple workflow for testing document generation',
    projectId,
    creatorId: user.id,
    ownerId: user.id,
    status: 'active',
    isPublic: true,
    publicLink: 'quick-test-' + Date.now(),
  }).returning();

  console.log('✓ Workflow created:', workflow[0].id);

  // Create sections
  const section1 = await db.insert(sections).values({
    id: randomUUID(),
    workflowId: workflow[0].id,
    title: 'Basic Info',
    description: 'Tell us about yourself',
    order: 1,
  }).returning();

  await db.insert(steps).values([
    {
      id: randomUUID(),
      sectionId: section1[0].id,
      type: 'short_text',
      title: 'Your Name',
      alias: 'name',
      required: true,
      order: 1,
    },
    {
      id: randomUUID(),
      sectionId: section1[0].id,
      type: 'short_text',
      title: 'Your Email',
      alias: 'email',
      required: true,
      order: 2,
    },
  ]);

  console.log('✓ Created section with 2 steps');

  // Create Final Documents section
  const section2 = await db.insert(sections).values({
    id: randomUUID(),
    workflowId: workflow[0].id,
    title: 'Your Document',
    description: 'Download your generated document',
    order: 2,
    config: {
      finalBlock: true,
      screenTitle: 'Document Ready!',
      markdownMessage: '# Success!\n\nYour document has been generated.',
      templates: [],
    },
  }).returning();

  console.log('✓ Created Final Documents section');

  console.log('\n=== Workflow Created Successfully ===');
  console.log('Workflow ID:', workflow[0].id);
  console.log('Owner:', user.email);
  console.log('Public Link:', `http://localhost:5000/run/${workflow[0].publicLink}`);
  console.log('Direct Link:', `http://localhost:5000/run/${workflow[0].id}`);
  console.log('\nThis workflow should work with your current login!');

  process.exit(0);
}

createWorkflowForCurrentUser().catch(console.error);
