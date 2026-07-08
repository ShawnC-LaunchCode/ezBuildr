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

// All imports are `import type` — erased at runtime, so no circular dependency risk.
import type { Logger } from 'pino';

import type { db } from '../db';
import type { UserRepository } from '../repositories/UserRepository';
import type { ProjectRepository } from '../repositories/ProjectRepository';
import type { WorkflowRepository } from '../repositories/WorkflowRepository';
import type { SectionRepository } from '../repositories/SectionRepository';
import type { StepRepository } from '../repositories/StepRepository';
import type { WorkflowRunRepository } from '../repositories/WorkflowRunRepository';
import type { StepValueRepository } from '../repositories/StepValueRepository';
import type { LogicRuleRepository } from '../repositories/LogicRuleRepository';
import type { BlockRepository } from '../repositories/BlockRepository';
import type { TransformBlockRepository } from '../repositories/TransformBlockRepository';
import type { SystemStatsRepository } from '../repositories/SystemStatsRepository';
import type { TeamRepository } from '../repositories/TeamRepository';
import type { ProjectAccessRepository, WorkflowAccessRepository } from '../repositories/AclRepository';
import type { DatavaultDatabasesRepository } from '../repositories/DatavaultDatabasesRepository';
import type { DatavaultTablesRepository } from '../repositories/DatavaultTablesRepository';
import type { DatavaultRowsRepository } from '../repositories/DatavaultRowsRepository';

import type { AuthService } from '../services/AuthService';
import type { AclService } from '../services/AclService';
import type { ProjectService } from '../services/ProjectService';
import type { WorkflowService } from '../services/WorkflowService';
import type { SectionService } from '../services/SectionService';
import type { StepService } from '../services/StepService';
import type { RunService } from '../services/RunService';
import type { LogicService } from '../services/LogicService';
import type { BlockRunner } from '../services/BlockRunner';
import type { IntakeService } from '../services/IntakeService';

import type { DatavaultDatabasesService } from '../services/DatavaultDatabasesService';
import type { DatavaultTablesService } from '../services/DatavaultTablesService';
import type { DatavaultRowsService } from '../services/DatavaultRowsService';

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

/**
 * Type mapping for DI tokens to their service types.
 * This enables type-safe resolution in TypeScript.
 *
 * @example
 * ```typescript
 * const logger = container.resolve<ServiceMap[typeof LOGGER]>(LOGGER);
 * ```
 */
export interface ServiceMap {
  [LOGGER]: Logger;
  [DATABASE]: typeof db;

  // Repositories
  [REPOSITORY_USER]: UserRepository;
  [REPOSITORY_PROJECT]: ProjectRepository;
  [REPOSITORY_WORKFLOW]: WorkflowRepository;
  [REPOSITORY_SECTION]: SectionRepository;
  [REPOSITORY_STEP]: StepRepository;
  [REPOSITORY_WORKFLOW_RUN]: WorkflowRunRepository;
  [REPOSITORY_STEP_VALUE]: StepValueRepository;
  [REPOSITORY_LOGIC_RULE]: LogicRuleRepository;
  [REPOSITORY_BLOCK]: BlockRepository;
  [REPOSITORY_TRANSFORM_BLOCK]: TransformBlockRepository;
  [REPOSITORY_ANALYTICS]: unknown;   // AnalyticsRepository removed (Nov 2025)
  [REPOSITORY_FILE]: unknown;        // FileRepository removed (Nov 2025)
  [REPOSITORY_SYSTEM_STATS]: SystemStatsRepository;
  [REPOSITORY_TEAM]: TeamRepository;
  [REPOSITORY_PROJECT_ACCESS]: ProjectAccessRepository;
  [REPOSITORY_WORKFLOW_ACCESS]: WorkflowAccessRepository;
  [REPOSITORY_DATAVAULT_DATABASES]: DatavaultDatabasesRepository;
  [REPOSITORY_DATAVAULT_TABLES]: DatavaultTablesRepository;
  [REPOSITORY_DATAVAULT_ROWS]: DatavaultRowsRepository;

  // Services
  [SERVICE_AUTH]: AuthService;
  [SERVICE_ACL]: AclService;
  [SERVICE_PROJECT]: ProjectService;
  [SERVICE_WORKFLOW]: WorkflowService;
  [SERVICE_SECTION]: SectionService;
  [SERVICE_STEP]: StepService;
  [SERVICE_RUN]: RunService;
  [SERVICE_LOGIC]: LogicService;
  [SERVICE_BLOCK_RUNNER]: BlockRunner;
  [SERVICE_INTAKE]: IntakeService;
  [SERVICE_ANALYTICS]: unknown;      // AnalyticsService removed (Nov 2025)

  [SERVICE_SCRIPT_ENGINE]: unknown;  // ScriptEngine — no single class export
  [SERVICE_DATAVAULT_DATABASES]: DatavaultDatabasesService;
  [SERVICE_DATAVAULT_TABLES]: DatavaultTablesService;
  [SERVICE_DATAVAULT_ROWS]: DatavaultRowsService;
}
