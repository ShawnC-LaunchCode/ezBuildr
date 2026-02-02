
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- deep copy via JSON round-trip
    let migratedSchema: WorkflowSchema = JSON.parse(JSON.stringify(schema));

    logger.info({ currentVersion, targetVersion }, "Starting workflow migration");

    // eslint-disable-next-line no-constant-condition -- migration chain loop terminates on break
    while (true) {
        if (targetVersion && current === targetVersion) {
            break;
        }

        const migration = MIGRATION_REGISTRY[current];
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!migration) {
            if (targetVersion && current !== targetVersion) {
                throw new Error(`No migration path found from ${current} to ${targetVersion}`);
            }
            break; // End of chain
        }

        logger.info({ from: current, to: migration.toVersion }, "Applying migration");

        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- migration chain passes schema through
            migratedSchema = await migration.migrate(migratedSchema);
            applied.push(`${current}->${migration.toVersion}`);
            current = migration.toVersion;
        } catch (error) {
            logger.error({ error, from: current, to: migration.toVersion }, "Migration failed");
            throw error;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- migrated schema preserves WorkflowSchema shape
    return { schema: migratedSchema, appliedMigrations: applied };
}
