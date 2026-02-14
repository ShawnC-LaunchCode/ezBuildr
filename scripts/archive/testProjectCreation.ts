// eslint-disable-next-line import/no-unresolved
import { getDb, initializeDatabase } from '../server/db';
// eslint-disable-next-line import/no-unresolved
import { projectService } from '../server/services/ProjectService';
// eslint-disable-next-line import/no-unresolved
import { _tenants, users, _projects } from '../shared/schema';

async function testProjectCreation() {
  await initializeDatabase();
  const db = getDb();

  console.log('Testing project creation with tenantId...\n');

  // Get the first user
  const [user] = await db.select().from(users).limit(1);
  if (!user) {
    console.error('No users found in database');
    process.exit(1);
  }

  console.log('User:', {
    id: user.id,
    email: user.email,
    tenantId: user.tenantId,
  });

  if (!user.tenantId) {
    console.error('User does not have a tenantId!');
    process.exit(1);
  }

  // Try to create a project
  try {
    const projectData = {
      title: 'Test Project',
      name: 'Test Project',
      description: 'Testing project creation with tenantId',
      creatorId: user.id,
      tenantId: user.tenantId,
      createdBy: user.id,
      ownerId: user.id,
      status: 'active' as const,
    };

    console.log('\nCreating project with data:', projectData);

    const project = await projectService.createProject(projectData, user.id);

    console.log('\n✅ Project created successfully!', {
      id: project.id,
      name: project.name,
      tenantId: project.tenantId,
    });

    // Clean up - delete the test project
    await projectService.deleteProject(project.id, user.id);
    console.log('\n✅ Test project cleaned up');

  } catch (error) {
    console.error('\n❌ Failed to create project:', error);
    process.exit(1);
  }

  process.exit(0);
}

testProjectCreation().catch(console.error);
