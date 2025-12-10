
import "./migrators/v1_block_refactor";
import "./migrators/v2_validation_migration";
import "./migrators/v3_scripting_migration";

export { MIGRATION_REGISTRY, registerMigration, getMigration } from "./registry";
export { runMigrations } from "./runner";
