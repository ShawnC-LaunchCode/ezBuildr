import { v4 as uuidv4 } from 'uuid';


import { mockIntegration } from './MockIntegrationLayer';
import { PreviewVariableResolver } from './PreviewVariableResolver';

import type { ApiStep, ApiSection } from '../vault-api';

export interface TraceEntry {
    id: string;
    stepId?: string;
    type: 'step' | 'logic' | 'action' | 'error';
    status: 'executed' | 'skipped' | 'failed';
    message?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: any;
    timestamp: number;
}

export interface PreviewRunState {
    id: string;
    workflowId: string;
    values: Record<string, unknown>;
    trace: TraceEntry[];
    currentSectionIndex: number;
    completed: boolean;
    updatedAt: number;
    mode: 'preview';
}

export interface PreviewConfig {
    workflowId: string;
    sections: ApiSection[];
    steps: ApiStep[];
    snapshotValues?: Record<string, unknown>;
    initialValues?: Record<string, unknown>;
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
            trace: [],
            currentSectionIndex: 0,
            completed: false,
            updatedAt: Date.now(),
            mode: 'preview'
        };
    }

    // --- Tracing ---

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    addTraceEntry(entry: Omit<TraceEntry, 'id' | 'timestamp'>) {
        const newEntry: TraceEntry = {
            ...entry,
            id: uuidv4(),
            timestamp: Date.now()
        };

        this.state.trace.push(newEntry);
        this.state.updatedAt = Date.now();
        this.notify();
        return newEntry;
    }

    // --- State Accessors ---

    getState(): PreviewRunState {
        // Cache the snapshot to prevent infinite loops in useSyncExternalStore
        if (!this.cachedSnapshot) {
            this.cachedSnapshot = { ...this.state };
        }
        return this.cachedSnapshot;
    }

    getValues(): Record<string, unknown> {
        return { ...this.state.values };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getValue(stepId: string): any {
        return this.state.values[stepId];
    }

    // --- Mutators ---

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type
    setValue(stepId: string, value: any) {
        this.state.values[stepId] = value;
        this.state.updatedAt = Date.now();
        this.notify();
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    setValues(values: Record<string, unknown>) {
        Object.assign(this.state.values, values);
        this.state.updatedAt = Date.now();
        this.notify();
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    setCurrentSection(index: number) {
        if (index >= 0 && index < this.sections.length) {
            this.state.currentSectionIndex = index;
            this.state.updatedAt = Date.now();
            this.notify();
        }
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    completeRun() {
        this.state.completed = true;
        this.state.updatedAt = Date.now();
        this.notify();
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    updateSchema(sections: ApiSection[], steps: ApiStep[]) {
        // eslint-disable-next-line no-console
        console.log('[PreviewEnvironment] Hot Reloading Schema...');
        this.sections = sections;
        this.steps = steps;

        // Prune values for steps that no longer exist?
        // For now, keep them (loose mode) to avoid data loss during rapid edits

        this.notify();
    }

    // --- Mock Integration Access ---

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    get mocks() {
        return mockIntegration;
    }

    // --- Subscriptions ---

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    private notify() {
        // Create new cached snapshot immediately so getState() returns consistent reference
        this.cachedSnapshot = { ...this.state };
        this.listeners.forEach(l => l());
    }

    // --- Helpers ---

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    getSections() { return this.sections; }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    getSteps() { return this.steps; }
}
