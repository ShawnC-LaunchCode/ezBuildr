
import { ValidationSchema } from "@shared/validation/ValidationSchema";

export interface WorkflowSchema {
    sections: any[];
    steps: any[];
    // Add other top-level schema properties as needed
    version?: string; // Schema version, if we decide to track it inside the JSON too
}

export type MigrationFunction = (schema: WorkflowSchema) => Promise<WorkflowSchema>;

export interface MigrationDefinition {
    toVersion: string; // The version definition this migration *produces* or targets? 
    // Actually, versionNumber is an integer. 
    // But schema migrations might need semantic versions or named steps.
    // The prompt uses "1.0.0" -> "1.1.0". 
    // Let's stick to semantic strings for schema versions to decouple from DB version IDs.
    description: string;
    migrate: MigrationFunction;
}

export const MIGRATION_REGISTRY: Record<string, MigrationDefinition> = {};

export function registerMigration(fromVersion: string, definition: MigrationDefinition) {
    MIGRATION_REGISTRY[fromVersion] = definition;
}

export function getMigration(fromVersion: string): MigrationDefinition | undefined {
    return MIGRATION_REGISTRY[fromVersion];
}
