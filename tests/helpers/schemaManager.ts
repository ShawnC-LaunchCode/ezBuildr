import crypto from 'crypto';

import { Client } from 'pg';

/**
 * Manages reliable database schema isolation for parallel testing.
 * Uses raw 'pg' client to avoid Drizzle connection pooling issues during setup/teardown.
 */
export class SchemaManager {
    private static workerId: number = parseInt(process.env.VITEST_WORKER_ID || '0', 10);
    private static poolId: string = process.env.VITEST_POOL_ID || '1';

    // Generate a schema name that is unique to this worker and STABLE across test files
    // Logic: test_schema_w{workerId}
    static generateSchemaName(): string {
        return `test_schema_w${this.workerId}`;
    }

    /**
     * Creates or reuses a dedicated schema for the test worker.
     * Returns the connection string and a flag indicating if the schema was newly created.
     */
    static async createTestSchema(baseConnectionString: string): Promise<{ schemaName: string, connectionString: string, existed: boolean }> {
        const schemaName = this.generateSchemaName();

        // Connect to the default 'postgres' or base DB to execute the CREATE SCHEMA command
        const client = new Client({ connectionString: baseConnectionString });

        try {
            await client.connect();

            // Check if schema exists
            const checkResult = await client.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`, [schemaName]);
            const existed = checkResult.rowCount !== null && checkResult.rowCount > 0;

            if (existed) {
                console.log(`[SchemaManager] Reusing existing isolated schema: ${schemaName}`);
            } else {
                console.log(`[SchemaManager] Creating isolated schema: ${schemaName}`);
                // Create schema
                await client.query(`CREATE SCHEMA "${schemaName}"`);
                // Set permissions
                await client.query(`GRANT ALL ON SCHEMA "${schemaName}" TO CURRENT_USER`);
            }

            // Determine the connection string with the correct search_path
            const url = new URL(baseConnectionString);
            console.log(`[SchemaManager] Processing URL: ${url.hostname} (Port: ${url.port})`);

            // NEON-SPECIFIC FIX:
            // Neon Transaction Pooling (port 6543, -pooler domain) does NOT support 'search_path' in startup options.
            // We MUST use the Direct endpoint (port 5432, no -pooler) for schema isolation to work.
            if (url.hostname.includes('neon.tech') || url.hostname.includes('neon.co')) {
                let modified = false;
                if (url.port !== '5432' && url.port !== '') {
                    // Explicit port that isn't 5432
                    console.log(`[SchemaManager] Switching port from ${url.port} to 5432`);
                    url.port = '5432';
                    modified = true;
                }

                if (url.hostname.includes('-pooler')) {
                    console.log(`[SchemaManager] Removing -pooler from hostname: ${url.hostname}`);
                    url.hostname = url.hostname.replace('-pooler', '');
                    modified = true;
                }

                if (modified) {
                    console.log('[SchemaManager] Switched to Direct Connection for schema isolation.');
                }

                // Ensure SSL is required
                url.searchParams.set('sslmode', 'require');
            }

            // Set search_path in startup options (only works on Direct/Session connections)
            // CRITICAL: encoding is handled by URL searchParams automatically
            url.searchParams.set('options', `-c search_path=${schemaName},public`);

            console.log(`[SchemaManager] Final Connection String (Host): ${url.hostname}`);
            console.log(`[SchemaManager] Final Connection String (Options): ${url.searchParams.get('options')}`);

            return {
                schemaName,
                connectionString: url.toString(),
                existed
            };

        } catch (error) {
            console.error(`[SchemaManager] Failed to create schema ${schemaName}:`, error);
            throw error;
        } finally {
            await client.end();
        }
    }

    /**
     * Drops the schema and all its objects.
     * MUST be called after database connections using this schema are closed.
     */
    static async dropTestSchema(baseConnectionString: string, schemaName: string): Promise<void> {
        if (!schemaName.startsWith('test_schema_')) {
            throw new Error(`Safety check failed: Refusing to drop schema '${schemaName}' that does not start with 'test_schema_'`);
        }

        const client = new Client({ connectionString: baseConnectionString });

        try {
            await client.connect();
            console.log(`[SchemaManager] Dropping isolated schema: ${schemaName}`);

            // Cascade is dangerous but necessary to remove tables/functions inside the schema
            await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);

        } catch (error) {
            console.error(`[SchemaManager] Failed to drop schema ${schemaName}:`, error);
            // Don't throw here, just log. We don't want to fail the test run/teardown just because cleanup failed.
            // Zombie schemas can be cleaned up by a separate cron or script.
        } finally {
            await client.end();
        }
    }
}
