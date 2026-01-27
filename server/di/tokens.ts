/**
 * Dependency Injection Tokens
 *
 * Centralized registry of all DI tokens used throughout the application.
 * Using symbols ensures type safety and prevents naming conflicts.
 *
 * Naming Convention:
 * - Repositories: REPOSITORY_<EntityName>
 * - Services: SERVICE_<ServiceName>
 * - Infrastructure: INFRA_<ComponentName>
 */

// ============================================================================
// Infrastructure Tokens
// ============================================================================

/**
 * Logger instance (Pino)
 */
export const LOGGER = Symbol('Logger');

/**
 * Database connection (Drizzle ORM)
 */
export const DATABASE = Symbol('Database');

// ============================================================================
// Repository Tokens
// ============================================================================

/**
 * User repository
 */
export const REPOSITORY_USER = Symbol('UserRepository');

/**
 * Project repository
 */
export const REPOSITORY_PROJECT = Symbol('ProjectRepository');

/**
 * Workflow repository
 */
export const REPOSITORY_WORKFLOW = Symbol('WorkflowRepository');

/**
 * Section repository
 */
export const REPOSITORY_SECTION = Symbol('SectionRepository');

/**
 * Step repository
 */
export const REPOSITORY_STEP = Symbol('StepRepository');

/**
 * Workflow run repository
 */
export const REPOSITORY_WORKFLOW_RUN = Symbol('WorkflowRunRepository');

/**
 * Step value repository
 */
export const REPOSITORY_STEP_VALUE = Symbol('StepValueRepository');

/**
 * Logic rule repository
 */
export const REPOSITORY_LOGIC_RULE = Symbol('LogicRuleRepository');

/**
 * Block repository
 */
export const REPOSITORY_BLOCK = Symbol('BlockRepository');

/**
 * Transform block repository
 */
export const REPOSITORY_TRANSFORM_BLOCK = Symbol('TransformBlockRepository');

/**
 * Analytics repository
 */
export const REPOSITORY_ANALYTICS = Symbol('AnalyticsRepository');

/**
 * File repository
 */
export const REPOSITORY_FILE = Symbol('FileRepository');

/**
 * System stats repository
 */
export const REPOSITORY_SYSTEM_STATS = Symbol('SystemStatsRepository');

/**
 * Team repository
 */
export const REPOSITORY_TEAM = Symbol('TeamRepository');

/**
 * Project access repository
 */
export const REPOSITORY_PROJECT_ACCESS = Symbol('ProjectAccessRepository');

/**
 * Workflow access repository
 */
export const REPOSITORY_WORKFLOW_ACCESS = Symbol('WorkflowAccessRepository');

/**
 * DataVault databases repository
 */
export const REPOSITORY_DATAVAULT_DATABASES = Symbol('DatavaultDatabasesRepository');

/**
 * DataVault tables repository
 */
export const REPOSITORY_DATAVAULT_TABLES = Symbol('DatavaultTablesRepository');

/**
 * DataVault rows repository
 */
export const REPOSITORY_DATAVAULT_ROWS = Symbol('DatavaultRowsRepository');

// ============================================================================
// Service Tokens
// ============================================================================

/**
 * Authentication service
 */
export const SERVICE_AUTH = Symbol('AuthService');

/**
 * ACL (Access Control List) service
 */
export const SERVICE_ACL = Symbol('AclService');

/**
 * Project service
 */
export const SERVICE_PROJECT = Symbol('ProjectService');

/**
 * Workflow service
 */
export const SERVICE_WORKFLOW = Symbol('WorkflowService');

/**
 * Section service
 */
export const SERVICE_SECTION = Symbol('SectionService');

/**
 * Step service
 */
export const SERVICE_STEP = Symbol('StepService');

/**
 * Run service
 */
export const SERVICE_RUN = Symbol('RunService');

/**
 * Logic service
 */
export const SERVICE_LOGIC = Symbol('LogicService');

/**
 * Block runner service
 */
export const SERVICE_BLOCK_RUNNER = Symbol('BlockRunner');

/**
 * Intake service
 */
export const SERVICE_INTAKE = Symbol('IntakeService');

/**
 * Analytics service
 */
export const SERVICE_ANALYTICS = Symbol('AnalyticsService');

/**
 * Document generation service
 */
export const SERVICE_DOCUMENT_GENERATION = Symbol('DocumentGenerationService');

/**
 * Script engine service (for custom scripting)
 */
export const SERVICE_SCRIPT_ENGINE = Symbol('ScriptEngine');

/**
 * DataVault databases service
 */
export const SERVICE_DATAVAULT_DATABASES = Symbol('DatavaultDatabasesService');

/**
 * DataVault tables service
 */
export const SERVICE_DATAVAULT_TABLES = Symbol('DatavaultTablesService');

/**
 * DataVault rows service
 */
export const SERVICE_DATAVAULT_ROWS = Symbol('DatavaultRowsService');

// ============================================================================
// Helper Type for Token-to-Service Mapping
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Type mapping for DI tokens to their service types
 * This enables type-safe resolution in TypeScript
 *
 * @example
 * ```typescript
 * const logger = container.resolve<ServiceMap[typeof LOGGER]>(LOGGER);
 * ```
 */
export interface ServiceMap {
  [LOGGER]: any; // Pino logger
  [DATABASE]: any; // Drizzle DB instance

  // Repositories
  [REPOSITORY_USER]: any;
  [REPOSITORY_PROJECT]: any;
  [REPOSITORY_WORKFLOW]: any;
  [REPOSITORY_SECTION]: any;
  [REPOSITORY_STEP]: any;
  [REPOSITORY_WORKFLOW_RUN]: any;
  [REPOSITORY_STEP_VALUE]: any;
  [REPOSITORY_LOGIC_RULE]: any;
  [REPOSITORY_BLOCK]: any;
  [REPOSITORY_TRANSFORM_BLOCK]: any;
  [REPOSITORY_ANALYTICS]: any;
  [REPOSITORY_FILE]: any;
  [REPOSITORY_SYSTEM_STATS]: any;
  [REPOSITORY_TEAM]: any;
  [REPOSITORY_PROJECT_ACCESS]: any;
  [REPOSITORY_WORKFLOW_ACCESS]: any;
  [REPOSITORY_DATAVAULT_DATABASES]: any;
  [REPOSITORY_DATAVAULT_TABLES]: any;
  [REPOSITORY_DATAVAULT_ROWS]: any;

  // Services
  [SERVICE_AUTH]: any;
  [SERVICE_ACL]: any;
  [SERVICE_PROJECT]: any;
  [SERVICE_WORKFLOW]: any;
  [SERVICE_SECTION]: any;
  [SERVICE_STEP]: any;
  [SERVICE_RUN]: any;
  [SERVICE_LOGIC]: any;
  [SERVICE_BLOCK_RUNNER]: any;
  [SERVICE_INTAKE]: any;
  [SERVICE_ANALYTICS]: any;
  [SERVICE_DOCUMENT_GENERATION]: any;
  [SERVICE_SCRIPT_ENGINE]: any;
  [SERVICE_DATAVAULT_DATABASES]: any;
  [SERVICE_DATAVAULT_TABLES]: any;
  [SERVICE_DATAVAULT_ROWS]: any;
}
