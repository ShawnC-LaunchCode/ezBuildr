import { v4 as uuidv4 } from 'uuid';
import type { ApiStep, ApiSection } from '@/lib/vault-api';
import { PreviewVariableResolver } from './PreviewVariableResolver';
import { mockIntegration } from './MockIntegrationLayer';

export interface PreviewRunState {
    id: string;
    workflowId: string;
    values: Record<string, any>;
    currentSectionIndex: number;
    completed: boolean;
    updatedAt: number;
    mode: 'preview';
}

export interface PreviewConfig {
    workflowId: string;
    sections: ApiSection[];
    steps: ApiStep[];
    snapshotValues?: Record<string, any>;
    initialValues?: Record<string, any>;
}

/**
 * PreviewEnvironment
 * 
 * The comprehensive state manager for a Preview Run.
 * Replaces the simpler 'PreviewSession' with support for:
 * - Hot Reloading (schema injection)
 * - Snapshot management
 * - Strict/Loose mode (TBD)
 * - Mock Integrations
 */
export class PreviewEnvironment {
    private state: PreviewRunState;
    private listeners: Set<() => void> = new Set();
    private cachedSnapshot: PreviewRunState | null = null;

    // Schema Registry
    private sections: ApiSection[];
    private steps: ApiStep[];

    constructor(config: PreviewConfig) {
        this.sections = config.sections;
        this.steps = config.steps;

        // Resolve initial values using precedence logic
        const resolvedValues = PreviewVariableResolver.resolveInitialValues(
            config.steps,
            config.snapshotValues,
            config.initialValues
        );

        this.state = {
            id: `preview-env-${uuidv4()}`,
            workflowId: config.workflowId,
            values: resolvedValues,
            currentSectionIndex: 0,
            completed: false,
            updatedAt: Date.now(),
            mode: 'preview'
        };
    }

    // --- State Accessors ---

    getState(): PreviewRunState {
        // Cache the snapshot to prevent infinite loops in useSyncExternalStore
        if (!this.cachedSnapshot) {
            this.cachedSnapshot = { ...this.state };
        }
        return this.cachedSnapshot;
    }

    getValues(): Record<string, any> {
        return { ...this.state.values };
    }

    getValue(stepId: string): any {
        return this.state.values[stepId];
    }

    // --- Mutators ---

    setValue(stepId: string, value: any) {
        this.state.values[stepId] = value;
        this.state.updatedAt = Date.now();
        this.notify();
    }

    setValues(values: Record<string, any>) {
        Object.assign(this.state.values, values);
        this.state.updatedAt = Date.now();
        this.notify();
    }

    setCurrentSection(index: number) {
        if (index >= 0 && index < this.sections.length) {
            this.state.currentSectionIndex = index;
            this.state.updatedAt = Date.now();
            this.notify();
        }
    }

    completeRun() {
        this.state.completed = true;
        this.state.updatedAt = Date.now();
        this.notify();
    }

    reset() {
        this.state.values = PreviewVariableResolver.resolveInitialValues(this.steps);
        this.state.currentSectionIndex = 0;
        this.state.completed = false;
        this.state.updatedAt = Date.now();
        this.notify();
    }

    // --- Hot Reload Support ---

    /**
     * Update schema without losing state (unless necessary)
     */
    updateSchema(sections: ApiSection[], steps: ApiStep[]) {
        console.log('[PreviewEnvironment] Hot Reloading Schema...');
        this.sections = sections;
        this.steps = steps;

        // Prune values for steps that no longer exist? 
        // For now, keep them (loose mode) to avoid data loss during rapid edits

        this.notify();
    }

    // --- Mock Integration Access ---

    get mocks() {
        return mockIntegration;
    }

    // --- Subscriptions ---

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify() {
        // Create new cached snapshot immediately so getState() returns consistent reference
        this.cachedSnapshot = { ...this.state };
        this.listeners.forEach(l => l());
    }

    // --- Helpers ---

    getSections() { return this.sections; }
    getSteps() { return this.steps; }
}
