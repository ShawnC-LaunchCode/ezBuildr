import _crypto from 'crypto';

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
    //
    // The _vN suffix is the schema-cache generation. Bumped to _v6 when the
    // migration chain was regenerated from the Drizzle schema: a fresh
    // 0000_init_baseline (full current schema) + 0001_enable_rls +
    // 0002_db_functions. Bumping forces a from-scratch rebuild, so stale _v5
    // schemas (which relied on the now-removed tests/setup.ts failsafe block)
    // are abandoned and new schemas are built by the migrations alone.
    //
    // Bumped to _v7 for ICW2-B7: 0003_rich_wild_child (ai_usage table) +
    // 0004_ai_usage_rls (its tenant_isolation policy) — stale _v6 schemas
    // don't have ai_usage and would fail every AI-budget test.
    //
    // Bumped to _v8 for ICW2-B1: 0005_lying_amphibian adds `deleted_at` to
    // `sections`/`steps` (soft-delete) and rebuilds `steps_workflow_alias_unique`
    // with a `deleted_at IS NULL` scope — stale _v7 schemas lack the column
    // and the new unique-index shape.
    //
    // Bumped to _v9 for 0006_remove_legacy_intake_reuse, which removes retired
    // columns `assigned_to` and `reuse_strategy` from `workflow_runs`.
    // Bumped to _v10 for 0007_add_storage_key, which adds `storageKey` to
    // `run_generated_documents` (DEBT-15).
    // Bumped to _v11 because _v10 got cached with an empty 0007 migration.
    // Bumped to _v12 because _v11 got cached without not-null constraints on storageKey.
    // Bumped to _v13 for 0008_thick_the_order (LIST-1), which adds the 'list'
    // value to the step_type enum — stale _v12 schemas would reject it.
    // Bumped to _v14 for 0009_drop_legacy_step_types (LIST-13), which drops the
    // 'repeater'/'loop_group' enum values (via a full type recreate) and the
    // `steps.repeater_config` column — a stale _v13 schema still has both.
    // Bumped to _v15 for 0010_yellow_pandemic (DV-10), which removes the
    // retired declarative DataVault mapping table.
    // Bumped to _v16 for 0011_datavault_rls_phase4 (DVH-3), which adds RLS
    // policies + helper functions for datavault_rows/values/columns/
    // table_permissions/database_access/table_access — a stale _v15 schema
    // lacks them and the new RLS tests would silently see no policies.
    // Bumped to _v17 for 0012_datavault_unique_keys (DVH-2), which adds
    // datavault_unique_keys table and uniqueness constraint.
    // Bumped to _v18 for 0013_datavault_filter_indexes (DVP-2), which adds
    // bounded expression and trigram GIN indexes on datavault_values.
    // Bumped to _v20 for GH-170 migrations 0014/0015, which add the
    // run_document_deliveries table and its RLS tenant-isolation policy.
    // Bumped to _v21 for 0016_delivery_tenant_not_null, which makes
    // run_document_deliveries.tenant_id NOT NULL — a stale _v20 schema still
    // accepts the orphan row the new test proves is rejected.
    // Bumped to _v22 for GH-157 migration 0017, which adds completed/voided/
    // expired signature events and the voided signature-request status.
    // Bumped to _v23 for GH-147, which adds expiring run resume links and
    // explicit run-assignment metadata.
    // Bumped to _v24 for LU-6a (0020/0021), which adds `logic_rules.when`
    // and drops the flat `operator`/`condition_value`/`logical_operator`
    // columns — a stale _v23 schema still has the dropped columns and
    // inserts against the new shape would fail.
    // Bumped to _v25 for LU-6c (0022_ancient_stellaris), which drops the now
    // orphaned `condition_operator` Postgres enum type (nothing has
    // referenced it since 0021 dropped the column it backed).
    // Bumped to _v26 for MAP-2 (0023_condemned_hannibal_king), which drops
    // the dead `sections.skip_if` column — a stale _v25 schema still has it.
    // Bumped to _v27 for RLS-3 (0024_repair_rls_coverage), which adds the 24
    // direct-tenant_id policies plus the workflows/sections/steps
    // ownership-derived policies that 0001/0004 defined but never actually
    // applied in a real database (their `to_regclass` guard ran before those
    // tables existed) — a stale _v26 schema still has only the 9 policies
    // 0011/0012/0015/0019 managed to apply for real, and the new coverage
    // test would fail against it for a reason that has nothing to do with
    // the migration under test.
    static generateSchemaName(): string {
        return `test_schema_w${this.workerId}_v27`;
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

            // NOTE: We do NOT set search_path in the connection string options because:
            // 1. Neon Direct connections reject startup parameters with 08P01 errors
            // 2. Standard pg may pass -c options as startup params which some hosts reject
            // Instead, server/db.ts sets search_path on each connection via pool.connect() wrapper
            // using process.env.TEST_SCHEMA (set by tests/setup.ts)

            console.log(`[SchemaManager] Final Connection String (Host): ${url.hostname}`);

            return {
                schemaName,
                connectionString: url.toString(),
                existed
            };

        } catch (error: unknown) {
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

        } catch (error: unknown) {
            console.error(`[SchemaManager] Failed to drop schema ${schemaName}:`, error);
            // Don't throw here, just log. We don't want to fail the test run/teardown just because cleanup failed.
            // Zombie schemas can be cleaned up by a separate cron or script.
        } finally {
            await client.end();
        }
    }
}
