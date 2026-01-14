
import { logger } from "../../logger";

import { MIGRATION_REGISTRY, WorkflowSchema } from "./registry";

/**
 * Runs migrations sequentially from a starting version to a target version.
 * If targetVersion is not provided, runs until no more migrations are found.
 */
export async function runMigrations(
    schema: WorkflowSchema,
    currentVersion: string,
    targetVersion?: string
): Promise<{ schema: WorkflowSchema; appliedMigrations: string[] }> {
    let current = currentVersion;
    const applied: string[] = [];
    let migratedSchema = JSON.parse(JSON.stringify(schema)); // Deep copy

    logger.info({ currentVersion, targetVersion }, "Starting workflow migration");

    while (true) {
        if (targetVersion && current === targetVersion) {
            break;
        }

        const migration = MIGRATION_REGISTRY[current];
        if (!migration) {
            if (targetVersion && current !== targetVersion) {
                throw new Error(`No migration path found from ${current} to ${targetVersion}`);
            }
            break; // End of chain
        }

        logger.info({ from: current, to: migration.toVersion }, "Applying migration");

        try {
            migratedSchema = await migration.migrate(migratedSchema);
            applied.push(`${current}->${migration.toVersion}`);
            current = migration.toVersion;
        } catch (error) {
            logger.error({ error, from: current, to: migration.toVersion }, "Migration failed");
            throw error;
        }
    }

    return { schema: migratedSchema, appliedMigrations: applied };
}
