/**
 * PreviewSession - In-memory run state manager for preview mode
 *
 * This manager creates and maintains preview run state entirely in memory,
 * without persisting data to the database. It provides an API identical to
 * the production run state manager but operates in isolation.
 *
 * Key Features:
 * - In-memory only (no database writes)
 * - Supports default values from step configurations
 * - Manages step values by alias
 * - Handles pagination and visibility state
 * - Can be torn down when preview closes
 */

import { v4 as uuidv4 } from 'uuid';

import type { ApiStep, ApiSection } from '@/lib/vault-api';

import { createLogger } from '../logger';
import { generateAIRandomValues } from '../randomizer/aiRandomFill';
import { generateRandomValuesForWorkflow, generateRandomValuesForSteps } from '../randomizer/randomFill';

export interface PreviewRun {
  id: string;
  workflowId: string;
  values: Record<string, any>; // stepId -> value
  currentSectionIndex: number;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
  mode: 'preview';
}

export interface PreviewSessionOptions {
  workflowId: string;
  sections: ApiSection[];
  steps: ApiStep[];
  snapshotValues?: Record<string, any>; // For loading from snapshots (Prompt 7)
  initialValues?: Record<string, any>; // For loading initial values
  workflowTitle?: string; // For AI context
}

/**
 * PreviewSession manages a single preview run instance in memory
 */
export class PreviewSession {
  private logger = createLogger({ module: 'PreviewSession' });
  private run: PreviewRun;
  private sections: ApiSection[];
  private steps: ApiStep[];
  private listeners: Set<() => void> = new Set();
  private workflowTitle?: string;
  private cachedValues: Record<string, any> | null = null;

  constructor(options: PreviewSessionOptions) {
    const { workflowId, sections, steps, snapshotValues, initialValues, workflowTitle } = options;
    this.workflowTitle = workflowTitle;

    // Generate preview run ID
    const runId = `preview-${uuidv4()}`;

    // Initialize values with defaults or snapshot values
    const values: Record<string, any> = {};

    // First, populate with snapshot values if provided
    if (snapshotValues) {
      Object.assign(values, snapshotValues);
    }

    // Then, populate with initial values if provided
    if (initialValues) {
      Object.assign(values, initialValues);
    }

    // Finally, populate with default values from step configs (if not already set)
    steps.forEach(step => {
      if (step.defaultValue !== null && step.defaultValue !== undefined && !values[step.id]) {
        values[step.id] = this.parseDefaultValue(step.defaultValue, step.type);
      }
    });

    this.run = {
      id: runId,
      workflowId,
      values,
      currentSectionIndex: 0,
      completed: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: 'preview',
    };

    this.sections = sections;
    this.steps = steps;
  }

  /**
   * Parse default value based on step type
   * Handles JSON strings and type conversions
   */
  private parseDefaultValue(defaultValue: any, stepType: string): any {
    // If it's already an object/array, return as-is
    if (typeof defaultValue === 'object' && defaultValue !== null) {
      return defaultValue;
    }

    // For complex block types, try to parse as JSON
    if (['address', 'multi_field', 'choice'].includes(stepType)) {
      if (typeof defaultValue === 'string') {
        try {
          return JSON.parse(defaultValue);
        } catch {
          // If parsing fails, return as-is
          return defaultValue;
        }
      }
    }

    // For simple types, return as-is
    return defaultValue;
  }

  /**
   * Get the preview run object
   */
  getRun(): PreviewRun {
    return { ...this.run };
  }

  /**
   * Get run ID
   */
  getRunId(): string {
    return this.run.id;
  }

  /**
   * Get workflow ID
   */
  getWorkflowId(): string {
    return this.run.workflowId;
  }

  /**
   * Get all step values (cached to prevent infinite loops in useSyncExternalStore)
   */
  getValues(): Record<string, any> {
    if (!this.cachedValues) {
      this.cachedValues = { ...this.run.values };
    }
    return this.cachedValues;
  }

  /**
   * Get value for a specific step
   */
  getValue(stepId: string): any {
    return this.run.values[stepId];
  }

  /**
   * Get value by alias
   */
  getValueByAlias(alias: string): any {
    const step = this.steps.find(s => s.alias === alias);
    if (!step) {return undefined;}
    return this.run.values[step.id];
  }

  /**
   * Set value for a step
   * Triggers re-render in React components
   */
  setValue(stepId: string, value: any): void {
    this.run.values[stepId] = value;
    this.run.updatedAt = Date.now();
    this.notifyListeners();
  }

  /**
   * Set multiple values at once
   */
  setValues(values: Record<string, any>): void {
    Object.assign(this.run.values, values);
    this.run.updatedAt = Date.now();
    this.notifyListeners();
  }

  /**
   * Clear all values (reset preview)
   */
  clearValues(): void {
    this.run.values = {};
    this.run.currentSectionIndex = 0;
    this.run.completed = false;
    this.run.updatedAt = Date.now();

    // Re-populate with default values
    this.steps.forEach(step => {
      if (step.defaultValue !== null && step.defaultValue !== undefined) {
        this.run.values[step.id] = this.parseDefaultValue(step.defaultValue, step.type);
      }
    });

    this.notifyListeners();
  }

  /**
   * Get current section index
   */
  getCurrentSectionIndex(): number {
    return this.run.currentSectionIndex;
  }

  /**
   * Set current section index
   */
  setCurrentSectionIndex(index: number): void {
    this.run.currentSectionIndex = index;
    this.run.updatedAt = Date.now();
    this.notifyListeners();
  }

  /**
   * Mark run as completed
   */
  complete(): void {
    this.run.completed = true;
    this.run.updatedAt = Date.now();
    this.notifyListeners();
  }

  /**
   * Check if run is completed
   */
  isCompleted(): boolean {
    return this.run.completed;
  }

  /**
   * Subscribe to value changes
   * Returns unsubscribe function
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    // Create new cached values immediately so getValues() returns consistent reference
    this.cachedValues = { ...this.run.values };
    this.listeners.forEach(listener => listener());
  }

  /**
   * Get sections
   */
  getSections(): ApiSection[] {
    return this.sections;
  }

  /**
   * Get steps
   */
  getSteps(): ApiStep[] {
    return this.steps;
  }

  /**
   * Get steps for a specific section
   */
  getStepsForSection(sectionId: string): ApiStep[] {
    return this.steps.filter(step => step.sectionId === sectionId);
  }

  /**
   * Destroy the preview session
   * Clears all listeners and state
   */
  destroy(): void {
    this.listeners.clear();
    this.run.values = {};
  }

  /**
   * Export run data (for debugging or snapshot creation)
   */
  export(): {
    runId: string;
    workflowId: string;
    values: Record<string, any>;
    valuesByAlias: Record<string, any>;
  } {
    // Create alias -> value mapping
    const valuesByAlias: Record<string, any> = {};
    this.steps.forEach(step => {
      if (step.alias && this.run.values[step.id] !== undefined) {
        valuesByAlias[step.alias] = this.run.values[step.id];
      }
    });

    return {
      runId: this.run.id,
      workflowId: this.run.workflowId,
      values: { ...this.run.values },
      valuesByAlias,
    };
  }

  /**
   * Fill entire workflow with random data
   * Uses AI if available, falls back to synthetic random
   *
   * @param useAI - Whether to use AI for generation (default: false)
   */
  async randomFillWorkflow(useAI: boolean = false): Promise<void> {
    this.logger.info('Filling entire workflow with random data');

    let randomValues: Record<string, any>;

    if (useAI) {
      // Use AI-assisted random fill
      randomValues = await generateAIRandomValues(
        this.steps,
        this.run.workflowId,
        this.workflowTitle
      );
    } else {
      // Use pure synthetic random
      randomValues = generateRandomValuesForWorkflow(this.steps);
    }

    // Overwrite run values
    this.run.values = randomValues;
    this.run.updatedAt = Date.now();

    // Reset to first section
    this.run.currentSectionIndex = 0;

    // Notify listeners (triggers re-render)
    this.notifyListeners();

    this.logger.info(`Filled ${Object.keys(randomValues).length} values`);
  }

  /**
   * Fill only the current page/section with random data
   * Uses AI if available, falls back to synthetic random
   *
   * @param useAI - Whether to use AI for generation (default: false)
   */
  async randomFillPage(useAI: boolean = false): Promise<void> {
    this.logger.info('Filling current page with random data');

    // Get current section
    const currentSection = this.sections[this.run.currentSectionIndex];
    if (!currentSection) {
      this.logger.warn('No current section found');
      return;
    }

    // Get steps for current section
    const currentPageSteps = this.steps.filter(
      step => step.sectionId === currentSection.id
    );

    if (currentPageSteps.length === 0) {
      this.logger.warn('No steps found for current section');
      return;
    }

    let randomValues: Record<string, any>;

    if (useAI) {
      // Use AI-assisted random fill
      randomValues = await generateAIRandomValues(
        currentPageSteps,
        this.run.workflowId,
        this.workflowTitle
      );
    } else {
      // Use pure synthetic random
      randomValues = generateRandomValuesForSteps(currentPageSteps);
    }

    // Merge with existing values (don't overwrite other pages)
    Object.assign(this.run.values, randomValues);
    this.run.updatedAt = Date.now();

    // Notify listeners (triggers re-render)
    this.notifyListeners();

    this.logger.info(`Filled ${Object.keys(randomValues).length} values on current page`);
  }
}

/**
 * PreviewSessionManager - Global manager for preview sessions
 * Maintains a registry of active preview sessions
 */
class PreviewSessionManager {
  private sessions: Map<string, PreviewSession> = new Map();

  /**
   * Create a new preview session
   */
  create(options: PreviewSessionOptions): PreviewSession {
    const session = new PreviewSession(options);
    this.sessions.set(session.getRunId(), session);
    return session;
  }

  /**
   * Get an existing preview session
   */
  get(runId: string): PreviewSession | undefined {
    return this.sessions.get(runId);
  }

  /**
   * Check if a session exists
   */
  has(runId: string): boolean {
    return this.sessions.has(runId);
  }

  /**
   * Delete a preview session
   */
  delete(runId: string): void {
    const session = this.sessions.get(runId);
    if (session) {
      session.destroy();
      this.sessions.delete(runId);
    }
  }

  /**
   * Clear all preview sessions
   */
  clear(): void {
    this.sessions.forEach(session => session.destroy());
    this.sessions.clear();
  }

  /**
   * Get count of active sessions
   */
  count(): number {
    return this.sessions.size;
  }
}

// Export singleton instance
export const previewSessionManager = new PreviewSessionManager();
