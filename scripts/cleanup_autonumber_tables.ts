
import { ilike, and } from 'drizzle-orm';

import { datavaultTables } from '@shared/schema';

import { db, initializeDatabase } from '../server/db';
import { datavaultTablesService } from '../server/services/DatavaultTablesService';

async function cleanup() {
    await initializeDatabase();
    console.log('Starting cleanup of autonumber test tables...');

    // Find tables containing "autonumber" AND "test" (case insensitive)
    const tablesToDelete = await db.query.datavaultTables.findMany({
        where: and(
            ilike(datavaultTables.name, '%autonumber%'),
            ilike(datavaultTables.name, '%test%')
        )
    });

    console.log(`Found ${tablesToDelete.length} tables to delete.`);

    for (const table of tablesToDelete) {
        console.log(`Deleting table: ${table.name} (${table.id})...`);
        try {
            // Use service to ensure proper cascade deletion
            await datavaultTablesService.deleteTable(table.id, table.tenantId);
            console.log(`Successfully deleted ${table.name}`);
        } catch (error: unknown) {
            console.error(`Failed to delete ${table.name}:`, error);
        }
    }

    console.log('Cleanup complete.');
    process.exit(0);
}

cleanup().catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
});
