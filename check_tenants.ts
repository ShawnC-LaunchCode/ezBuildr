
import { db, initializeDatabase } from './server/db';
import { tenants } from './shared/schema';

async function check() {
    await initializeDatabase();
    const allTenants = await db.select().from(tenants);
    console.log('Tenants count:', allTenants.length);
    if (allTenants.length > 0) {
        console.log('First tenant:', allTenants[0]);
    } else {
        console.log('No tenants found.');
    }
    process.exit(0);
}

check().catch(console.error);
