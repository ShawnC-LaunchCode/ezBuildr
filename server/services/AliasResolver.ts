/**
 * AliasResolver - Centralized Step Alias Resolution Utility
 *
 * Provides consistent alias-to-ID resolution across the entire application.
 * Consolidates scattered alias resolution logic into a single, testable utility.
 *
 * Usage patterns:
 * 1. Create resolver from steps: AliasResolver.fromSteps(steps)
 * 2. Create resolver from workflow: AliasResolver.fromWorkflow(workflow)
 * 3. Use inline resolver: AliasResolver.createInlineResolver(steps)
 */

import { createLogger } from '../logger';

const logger = createLogger({ module: 'alias-resolver' });

export interface StepWithAlias {
  id: string;
  alias?: string | null;
  sectionId?: string;
  title?: string;
}

export interface SectionWithAlias {
  id: string;
  alias?: string | null;
  title?: string;
}

export interface WorkflowWithAliases {
  sections?: Array<{
    id: string;
    alias?: string | null;
    title?: string;
    steps?: StepWithAlias[];
  }>;
}

export interface ResolutionResult {
  id: string;
  type: 'step' | 'section';
  alias?: string;
  title?: string;
}

export interface ResolutionError {
  aliasOrId: string;
  reason: 'not_found' | 'ambiguous' | 'invalid_input';
  suggestions?: string[];
  context?: string;
}

export type AliasResolverFn = (aliasOrId: string) => string | undefined;

/**
 * AliasResolver provides centralized alias-to-ID resolution
 */
export class AliasResolver {
  private aliasToId: Map<string, string> = new Map();
  private idToAlias: Map<string, string> = new Map();
  private stepDetails: Map<string, ResolutionResult> = new Map();
  private sectionDetails: Map<string, ResolutionResult> = new Map();
  private errors: ResolutionError[] = [];

  private constructor() {}

  /**
   * Create resolver from an array of steps
   */
  static fromSteps(steps: StepWithAlias[]): AliasResolver {
    const resolver = new AliasResolver();

    for (const step of steps) {
      if (!step.id) {
        resolver.errors.push({
          aliasOrId: step.alias || 'unknown',
          reason: 'invalid_input',
          context: `Step missing ID: ${JSON.stringify(step)}`,
        });
        continue;
      }

      // Map ID to itself (allows lookup by ID)
      resolver.aliasToId.set(step.id, step.id);

      // Map alias to ID if alias exists
      if (step.alias) {
        const normalizedAlias = step.alias.toLowerCase();

        // Check for duplicate aliases
        if (resolver.aliasToId.has(normalizedAlias)) {
          const existingId = resolver.aliasToId.get(normalizedAlias);
          if (existingId !== step.id) {
            resolver.errors.push({
              aliasOrId: step.alias,
              reason: 'ambiguous',
              context: `Duplicate alias "${step.alias}" maps to both ${existingId} and ${step.id}`,
            });
          }
        }

        resolver.aliasToId.set(normalizedAlias, step.id);
        resolver.aliasToId.set(step.alias, step.id); // Also store original case
        resolver.idToAlias.set(step.id, step.alias);
      }

      // Store step details for rich resolution
      resolver.stepDetails.set(step.id, {
        id: step.id,
        type: 'step',
        alias: step.alias || undefined,
        title: step.title,
      });
    }

    return resolver;
  }

  /**
   * Create resolver from a workflow structure (sections + steps)
   */
  static fromWorkflow(workflow: WorkflowWithAliases): AliasResolver {
    const resolver = new AliasResolver();
    const allSteps: StepWithAlias[] = [];

    for (const section of workflow.sections || []) {
      // Add section to resolver
      if (section.id) {
        resolver.aliasToId.set(section.id, section.id);

        if (section.alias) {
          const normalizedAlias = section.alias.toLowerCase();
          resolver.aliasToId.set(normalizedAlias, section.id);
          resolver.aliasToId.set(section.alias, section.id);
          resolver.idToAlias.set(section.id, section.alias);
        }

        resolver.sectionDetails.set(section.id, {
          id: section.id,
          type: 'section',
          alias: section.alias || undefined,
          title: section.title,
        });
      }

      // Collect steps
      if (section.steps) {
        allSteps.push(...section.steps.map(s => ({ ...s, sectionId: section.id })));
      }
    }

    // Add all steps using fromSteps logic
    const stepResolver = AliasResolver.fromSteps(allSteps);

    // Merge step data into this resolver
    stepResolver.aliasToId.forEach((id, alias) => resolver.aliasToId.set(alias, id));
    stepResolver.idToAlias.forEach((alias, id) => resolver.idToAlias.set(id, alias));
    stepResolver.stepDetails.forEach((details, id) => resolver.stepDetails.set(id, details));
    resolver.errors.push(...stepResolver.errors);

    return resolver;
  }

  /**
   * Create an inline resolver function (for use with evaluateConditionExpression)
   * This is the most common pattern used throughout the codebase
   */
  static createInlineResolver(steps: StepWithAlias[]): AliasResolverFn {
    const resolver = AliasResolver.fromSteps(steps);
    return (aliasOrId: string) => resolver.resolve(aliasOrId);
  }

  /**
   * Create a Map<string, string> for alias resolution (alias -> id)
   * Compatible with RunExecutionCoordinator and block runners
   */
  static createAliasMap(steps: StepWithAlias[]): Record<string, string> {
    const resolver = AliasResolver.fromSteps(steps);
    return resolver.toAliasMap();
  }

  /**
   * Resolve an alias or ID to a step/section ID
   * Returns undefined if not found
   */
  resolve(aliasOrId: string): string | undefined {
    if (!aliasOrId) return undefined;

    // Try exact match first
    if (this.aliasToId.has(aliasOrId)) {
      return this.aliasToId.get(aliasOrId);
    }

    // Try case-insensitive match
    const normalized = aliasOrId.toLowerCase();
    if (this.aliasToId.has(normalized)) {
      return this.aliasToId.get(normalized);
    }

    return undefined;
  }

  /**
   * Resolve with detailed result including type and metadata
   */
  resolveWithDetails(aliasOrId: string): ResolutionResult | undefined {
    const id = this.resolve(aliasOrId);
    if (!id) return undefined;

    // Check steps first, then sections
    if (this.stepDetails.has(id)) {
      return this.stepDetails.get(id);
    }
    if (this.sectionDetails.has(id)) {
      return this.sectionDetails.get(id);
    }

    return { id, type: 'step' };
  }

  /**
   * Resolve or throw an error with helpful context
   */
  resolveOrThrow(aliasOrId: string, context?: string): string {
    const resolved = this.resolve(aliasOrId);

    if (!resolved) {
      const error = this.createNotFoundError(aliasOrId, context);
      logger.error({ aliasOrId, context, error }, 'Alias resolution failed');
      throw new AliasResolutionError(error);
    }

    return resolved;
  }

  /**
   * Resolve multiple aliases, returning results and errors
   */
  resolveMany(aliasesOrIds: string[]): { resolved: Map<string, string>; errors: ResolutionError[] } {
    const resolved = new Map<string, string>();
    const errors: ResolutionError[] = [];

    for (const aliasOrId of aliasesOrIds) {
      const id = this.resolve(aliasOrId);
      if (id) {
        resolved.set(aliasOrId, id);
      } else {
        errors.push(this.createNotFoundError(aliasOrId));
      }
    }

    return { resolved, errors };
  }

  /**
   * Get the alias for an ID (reverse lookup)
   */
  getAlias(id: string): string | undefined {
    return this.idToAlias.get(id);
  }

  /**
   * Check if an alias or ID exists in the resolver
   */
  has(aliasOrId: string): boolean {
    return this.resolve(aliasOrId) !== undefined;
  }

  /**
   * Get all registered aliases
   */
  getAllAliases(): string[] {
    return Array.from(this.idToAlias.values());
  }

  /**
   * Get all registered IDs
   */
  getAllIds(): string[] {
    return Array.from(this.idToAlias.keys());
  }

  /**
   * Get any errors encountered during resolution
   */
  getErrors(): ResolutionError[] {
    return [...this.errors];
  }

  /**
   * Check if resolver has any errors
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Convert to a Record<string, string> for compatibility with existing code
   */
  toAliasMap(): Record<string, string> {
    const map: Record<string, string> = {};
    this.aliasToId.forEach((id, alias) => {
      map[alias] = id;
    });
    return map;
  }

  /**
   * Convert to inline resolver function
   */
  toResolverFn(): AliasResolverFn {
    return (aliasOrId: string) => this.resolve(aliasOrId);
  }

  /**
   * Create a not-found error with suggestions
   */
  private createNotFoundError(aliasOrId: string, context?: string): ResolutionError {
    // Find similar aliases for suggestions
    const allAliases = this.getAllAliases();
    const suggestions = allAliases
      .filter(alias => {
        const normalized = aliasOrId.toLowerCase();
        const aliasLower = alias.toLowerCase();
        return aliasLower.includes(normalized) ||
               normalized.includes(aliasLower) ||
               this.levenshteinDistance(normalized, aliasLower) <= 3;
      })
      .slice(0, 3);

    return {
      aliasOrId,
      reason: 'not_found',
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      context,
    };
  }

  /**
   * Calculate Levenshtein distance for fuzzy matching
   */
  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

/**
 * Custom error class for alias resolution failures
 */
export class AliasResolutionError extends Error {
  public readonly resolutionError: ResolutionError;

  constructor(error: ResolutionError) {
    const message = AliasResolutionError.formatMessage(error);
    super(message);
    this.name = 'AliasResolutionError';
    this.resolutionError = error;
  }

  private static formatMessage(error: ResolutionError): string {
    let message = `Failed to resolve alias or ID "${error.aliasOrId}": ${error.reason}`;

    if (error.suggestions && error.suggestions.length > 0) {
      message += `. Did you mean: ${error.suggestions.join(', ')}?`;
    }

    if (error.context) {
      message += ` Context: ${error.context}`;
    }

    return message;
  }
}

/**
 * Utility functions for common resolution patterns
 */
export const AliasResolverUtils = {
  /**
   * Resolve logic rule aliases to IDs
   */
  resolveLogicRules<T extends { conditionStepAlias?: string; targetAlias?: string }>(
    rules: T[],
    resolver: AliasResolver
  ): { resolved: T[]; errors: ResolutionError[] } {
    const resolved: T[] = [];
    const errors: ResolutionError[] = [];

    for (const rule of rules) {
      const resolvedRule = { ...rule };
      let hasError = false;

      if (rule.conditionStepAlias) {
        const conditionId = resolver.resolve(rule.conditionStepAlias);
        if (conditionId) {
          (resolvedRule as any).conditionStepId = conditionId;
        } else {
          errors.push({
            aliasOrId: rule.conditionStepAlias,
            reason: 'not_found',
            context: 'Logic rule condition step',
          });
          hasError = true;
        }
      }

      if (rule.targetAlias) {
        const targetId = resolver.resolve(rule.targetAlias);
        if (targetId) {
          (resolvedRule as any).targetId = targetId;
        } else {
          errors.push({
            aliasOrId: rule.targetAlias,
            reason: 'not_found',
            context: 'Logic rule target',
          });
          hasError = true;
        }
      }

      if (!hasError) {
        resolved.push(resolvedRule);
      }
    }

    return { resolved, errors };
  },

  /**
   * Build data context with both IDs and aliases as keys
   */
  buildDualKeyContext(
    stepValues: Array<{ stepId: string; value: any }>,
    resolver: AliasResolver
  ): Record<string, any> {
    const context: Record<string, any> = {};

    for (const sv of stepValues) {
      // Add by ID
      context[sv.stepId] = sv.value;

      // Add by alias if available
      const alias = resolver.getAlias(sv.stepId);
      if (alias) {
        context[alias] = sv.value;
      }
    }

    return context;
  },
};

export default AliasResolver;
