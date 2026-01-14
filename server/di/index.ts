/**
 * Dependency Injection Module
 *
 * Central export point for the DI system.
 * Import this module to access the container and service tokens.
 *
 * @example
 * ```typescript
 * import { container, tokens } from './di';
 *
 * const workflowService = container.resolve(tokens.SERVICE_WORKFLOW);
 * ```
 */

// Export container and its types
export { Container, container, type ServiceLifetime, type ServiceFactory } from './container';

// Export all DI tokens
export * as tokens from './tokens';

// Export registration utilities
export { bootstrapContainer, resetContainer, recreateContainer } from './registrations';
