import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { db } from '../../server/db';
import { sql } from 'drizzle-orm';

async function backfillRunTokens() {
    console.log('Starting batched run token hashing backfill...');
    
    // Make sure pgcrypto is available
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    let totalUpdated = 0;
    const batchSize = 1000;
    let rowsAffected = 0;

    do {
        // Find batchSize rows that need hashing
        const result = await db.execute(sql`
            WITH to_update AS (
                SELECT id 
                FROM "workflow_runs"
                WHERE "run_token" IS NOT NULL
                  AND "run_token" !~ '^[0-9a-f]{64}$'
                LIMIT ${batchSize}
            )
            UPDATE "workflow_runs"
            SET "run_token" = encode(digest("run_token", 'sha256'), 'hex')
            WHERE id IN (SELECT id FROM to_update)
            RETURNING id;
        `);
        
        rowsAffected = result.rowCount || 0;
        totalUpdated += rowsAffected;
        
        if (rowsAffected > 0) {
            console.log(`Hashed ${rowsAffected} run tokens (Total: ${totalUpdated})...`);
        }
        
        // Brief pause to prevent connection saturation
        await new Promise(resolve => setTimeout(resolve, 50));
        
    } while (rowsAffected === batchSize);

    console.log(`Backfill complete. Total run tokens hashed: ${totalUpdated}`);
}

backfillRunTokens()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Backfill failed:', err);
        process.exit(1);
    });
