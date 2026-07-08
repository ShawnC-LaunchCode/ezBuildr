

// eslint-disable-next-line import/no-unresolved
import { getDb, initializeDatabase } from '../server/db';
// eslint-disable-next-line import/no-unresolved
import { tenants, users, projects } from '../shared/schema';

async function checkTenant() {
  await initializeDatabase();
  const db = getDb();

  console.log('Checking for default tenant...');

  // Check tenants
  const allTenants = await db.select().from(tenants);
  console.log(`Found ${allTenants.length} tenants:`, allTenants);

  // Check users
  const allUsers = await db.select().from(users).limit(5);
  console.log(`\nFound ${allUsers.length} users (showing first 5):`, allUsers.map(u => ({
    id: u.id,
    email: u.email,
    tenantId: u.tenantId,
  })));

  // Check projects
  const allProjects = await db.select().from(projects).limit(5);
  console.log(`\nFound ${allProjects.length} projects (showing first 5):`, allProjects.map(p => ({
    id: p.id,
    name: p.name,
    tenantId: p.tenantId,
  })));

  process.exit(0);
}

checkTenant().catch(console.error);
