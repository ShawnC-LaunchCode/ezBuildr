/**
 * Service Registrations
 *
 * Centralized registration of all services, repositories, and infrastructure
 * components with the DI container.
 *
 * This file bootstraps the application's dependency graph and should be
 * imported early in the application lifecycle (before route registration).
 */

import { db } from '../db';
import { logger } from '../logger';

// Import repositories
import {
  userRepository,
  projectRepository,
  workflowRepository,
  sectionRepository,
  stepRepository,
  workflowRunRepository,
  stepValueRepository,
  logicRuleRepository,
  blockRepository,
  transformBlockRepository,


  systemStatsRepository,
  teamRepository,
  projectAccessRepository,
  workflowAccessRepository,
  datavaultDatabasesRepository,
  datavaultTablesRepository,
  datavaultRowsRepository,
} from '../repositories';

// Import services
import { ProjectService } from '../services/ProjectService';
import { RunService } from '../services/RunService';
import { WorkflowService } from '../services/WorkflowService';

import { container } from './container';
import * as tokens from './tokens';

/**
 * Register all infrastructure components
 */
function registerInfrastructure(): void {
  // Logger (singleton)
  container.register(
    tokens.LOGGER,
    () => logger,
    'singleton'
  );

  // Database connection (singleton)
  container.register(
    tokens.DATABASE,
    () => db,
    'singleton'
  );
}

/**
 * Register all repository instances
 * Repositories are typically singletons since they're stateless
 */
function registerRepositories(): void {
  // Core workflow repositories
  container.register(
    tokens.REPOSITORY_USER,
    () => userRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_PROJECT,
    () => projectRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_WORKFLOW,
    () => workflowRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_SECTION,
    () => sectionRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_STEP,
    () => stepRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_WORKFLOW_RUN,
    () => workflowRunRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_STEP_VALUE,
    () => stepValueRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_LOGIC_RULE,
    () => logicRuleRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_BLOCK,
    () => blockRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_TRANSFORM_BLOCK,
    () => transformBlockRepository,
    'singleton'
  );

  // Analytics and system repositories




  container.register(
    tokens.REPOSITORY_SYSTEM_STATS,
    () => systemStatsRepository,
    'singleton'
  );

  // Team and access control repositories
  container.register(
    tokens.REPOSITORY_TEAM,
    () => teamRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_PROJECT_ACCESS,
    () => projectAccessRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_WORKFLOW_ACCESS,
    () => workflowAccessRepository,
    'singleton'
  );

  // DataVault repositories
  container.register(
    tokens.REPOSITORY_DATAVAULT_DATABASES,
    () => datavaultDatabasesRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_DATAVAULT_TABLES,
    () => datavaultTablesRepository,
    'singleton'
  );

  container.register(
    tokens.REPOSITORY_DATAVAULT_ROWS,
    () => datavaultRowsRepository,
    'singleton'
  );
}

/**
 * Register all service instances
 * Services can be either singleton or transient depending on their nature
 */
function registerServices(): void {
  // WorkflowService (singleton)
  // Note: WorkflowService has optional constructor dependencies
  // For now, we use the existing pattern (pass undefined to use defaults)
  // In the future, we can refactor to resolve all dependencies from container
  container.register(
    tokens.SERVICE_WORKFLOW,
    (c) => {
      // Example of dependency resolution (currently using defaults)
      // In a full migration, we would resolve all dependencies:
      // const workflowRepo = c.resolve(tokens.REPOSITORY_WORKFLOW);
      // const sectionRepo = c.resolve(tokens.REPOSITORY_SECTION);
      // etc...
      return new WorkflowService();
    },
    'singleton'
  );

  // RunService (singleton)
  container.register(
    tokens.SERVICE_RUN,
    (c) => {
      return new RunService();
    },
    'singleton'
  );

  // ProjectService (singleton)
  container.register(
    tokens.SERVICE_PROJECT,
    (c) => {
      return new ProjectService();
    },
    'singleton'
  );

  // Add more services here as they are migrated to DI pattern
  // Example for future services:
  //
  // container.register(
  //   tokens.SERVICE_LOGIC,
  //   (c) => new LogicService(
  //     c.resolve(tokens.REPOSITORY_LOGIC_RULE),
  //     c.resolve(tokens.REPOSITORY_WORKFLOW)
  //   ),
  //   'singleton'
  // );
}

/**
 * Bootstrap the DI container with all registrations
 * Call this function once during application startup
 *
 * @example
 * ```typescript
 * // In server/index.ts or server/app.ts
 * import { bootstrapContainer } from './di';
 * await bootstrapContainer();
 * ```
 */
export function bootstrapContainer(): void {
  logger.info('Bootstrapping DI container...');

  registerInfrastructure();
  registerRepositories();
  registerServices();

  const registeredCount = container.getRegisteredTokens().length;
  logger.info(
    { count: registeredCount },
    'DI container bootstrapped successfully'
  );
}

/**
 * Reset the container (useful for testing)
 * Clears all singleton instances but keeps registrations
 */
export function resetContainer(): void {
  container.clearInstances();
  logger.debug('DI container reset');
}

/**
 * Create a fresh container for testing
 * Clears everything and re-registers services
 */
export function recreateContainer(): void {
  container.clear();
  bootstrapContainer();
  logger.debug('DI container recreated');
}
