/**
 * Dependency Injection Container
 *
 * A lightweight, type-safe DI container for managing service dependencies
 * and controlling object lifetimes across the application.
 *
 * Features:
 * - Type-safe service registration and resolution
 * - Singleton and transient lifetimes
 * - Factory function support for lazy initialization
 * - Clear error messages for missing dependencies
 */

import { logger } from '../logger';

/**
 * Service lifetime options
 * - singleton: Single instance shared across the application
 * - transient: New instance created on each resolution
 */
export type ServiceLifetime = 'singleton' | 'transient';

/**
 * Factory function that creates a service instance
 */
export type ServiceFactory<T> = (container: Container) => T;

/**
 * Service registration entry
 */
interface ServiceRegistration<T = any> {
  factory: ServiceFactory<T>;
  lifetime: ServiceLifetime;
  instance?: T;
}

/**
 * Simple Map-based dependency injection container
 *
 * @example
 * ```typescript
 * const container = new Container();
 *
 * // Register a singleton service
 * container.register('logger', () => createLogger(), 'singleton');
 *
 * // Register a transient service
 * container.register('userService', (c) =>
 *   new UserService(c.resolve('logger')),
 *   'transient'
 * );
 *
 * // Resolve a service
 * const userService = container.resolve('userService');
 * ```
 */
export class Container {
  private services = new Map<string | symbol, ServiceRegistration>();
  private resolutionStack: (string | symbol)[] = [];

  /**
   * Register a service with the container
   *
   * @param token - Unique identifier for the service
   * @param factory - Factory function that creates the service instance
   * @param lifetime - Service lifetime (singleton or transient)
   *
   * @example
   * ```typescript
   * container.register('database', () => createDatabase(), 'singleton');
   * container.register('userRepo', (c) => new UserRepository(c.resolve('database')), 'transient');
   * ```
   */
  register<T>(
    token: string | symbol,
    factory: ServiceFactory<T>,
    lifetime: ServiceLifetime = 'singleton'
  ): void {
    if (this.services.has(token)) {
      logger.warn({ token: token.toString() }, 'Service already registered, overwriting');
    }

    this.services.set(token, {
      factory,
      lifetime,
    });

    logger.debug(
      {
        token: token.toString(),
        lifetime
      },
      'Service registered'
    );
  }

  /**
   * Resolve a service from the container
   *
   * @param token - Service identifier
   * @returns The service instance
   * @throws Error if service is not registered or circular dependency detected
   *
   * @example
   * ```typescript
   * const userService = container.resolve('userService');
   * ```
   */
  resolve<T>(token: string | symbol): T {
    const registration = this.services.get(token);

    if (!registration) {
      throw new Error(
        `Service not registered: ${token.toString()}. ` +
        `Available services: ${Array.from(this.services.keys()).map(k => k.toString()).join(', ')}`
      );
    }

    // Check for circular dependencies
    if (this.resolutionStack.includes(token)) {
      const cycle = [...this.resolutionStack, token].map(t => t.toString()).join(' -> ');
      throw new Error(
        `Circular dependency detected: ${cycle}`
      );
    }

    // Singleton: return cached instance or create new one
    if (registration.lifetime === 'singleton') {
      if (!registration.instance) {
        this.resolutionStack.push(token);
        try {
          registration.instance = registration.factory(this);
          logger.debug(
            { token: token.toString() },
            'Singleton instance created'
          );
        } finally {
          this.resolutionStack.pop();
        }
      }
      return registration.instance as T;
    }

    // Transient: create new instance every time
    this.resolutionStack.push(token);
    try {
      const instance = registration.factory(this);
      logger.debug(
        { token: token.toString() },
        'Transient instance created'
      );
      return instance as T;
    } finally {
      this.resolutionStack.pop();
    }
  }

  /**
   * Check if a service is registered
   *
   * @param token - Service identifier
   * @returns true if service is registered
   */
  has(token: string | symbol): boolean {
    return this.services.has(token);
  }

  /**
   * Clear all singleton instances (useful for testing)
   *
   * @example
   * ```typescript
   * afterEach(() => {
   *   container.clearInstances();
   * });
   * ```
   */
  clearInstances(): void {
    for (const registration of this.services.values()) {
      if (registration.lifetime === 'singleton') {
        registration.instance = undefined;
      }
    }
    logger.debug('All singleton instances cleared');
  }

  /**
   * Clear all service registrations (useful for testing)
   */
  clear(): void {
    this.services.clear();
    this.resolutionStack = [];
    logger.debug('Container cleared');
  }

  /**
   * Get all registered service tokens
   */
  getRegisteredTokens(): (string | symbol)[] {
    return Array.from(this.services.keys());
  }
}

/**
 * Default application container
 * Can be replaced with a new instance for testing
 */
export const container = new Container();
