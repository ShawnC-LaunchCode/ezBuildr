
import { db, initializeDatabase } from './server/db';
import { tenants } from './shared/schema';

async function seed() {
    await initializeDatabase();
    const allTenants = await db.select().from(tenants);
    if (allTenants.length === 0) {
        console.log('Seeding default tenant...');
        const [newTenant] = await db.insert(tenants).values({
            name: 'Default Organization',
            slug: 'default',
            domain_verified: false,
        }).returning();
        console.log('Created tenant:', newTenant);
    } else {
        console.log('Tenant already exists:', allTenants[0]);
    }
    process.exit(0);
}

seed().catch(console.error);
