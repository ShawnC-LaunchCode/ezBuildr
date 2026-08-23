
// eslint-disable-next-line @typescript-eslint/naming-convention
import _ from "lodash";

import { WorkflowSchema } from "../migrations/registry";
export interface PropertyChange {
    oldValue: unknown;
    newValue: unknown;
}
export interface BlockDiff {
    id: string;
    type: string;
    changeType: 'added' | 'removed' | 'modified' | 'moved';
    propertyChanges?: Record<string, PropertyChange>;
}
export interface PageDiff {
    id: string;
    title: string;
    changeType: 'added' | 'removed' | 'modified' | 'moved';
    propertyChanges?: Record<string, PropertyChange>;
}
export interface WorkflowDiff {
    fromVersion?: string;
    toVersion?: string;
    pages: PageDiff[];
    steps: BlockDiff[];
    summary: {
        pagesAdded: number;
        pagesRemoved: number;
        stepsAdded: number;
        stepsRemoved: number;
        stepsModified: number;
    };
}
interface DiffablePage {
    id: string;
    title: string;
    order?: number;
    visibleIf?: unknown;
}

interface DiffableStep {
    id: string;
    type: string;
    title?: string;
    required?: boolean;
    pageId?: string;
    config?: unknown;
}
/**
 * Compare two workflow schemas and generate a structured diff.
 */
export function diffWorkflows(oldSchema: WorkflowSchema, newSchema: WorkflowSchema): WorkflowDiff {
    const diff: WorkflowDiff = {
        pages: [],
        steps: [],
        summary: {
            pagesAdded: 0,
            pagesRemoved: 0,
            stepsAdded: 0,
            stepsRemoved: 0,
            stepsModified: 0
        }
    };
    // 1. Diff Pages
    const oldPages = (oldSchema.pages ?? []) as DiffablePage[];
    const newPages = (newSchema.pages ?? []) as DiffablePage[];
    const oldPageMap = new Map(oldPages.map(s => [s.id, s]));
    const newPageMap = new Map(newPages.map(s => [s.id, s]));
    // Removed Pages
    oldPages.forEach(s => {
        if (!newPageMap.has(s.id)) {
            diff.pages.push({
                id: s.id,
                title: s.title,
                changeType: 'removed'
            });
            diff.summary.pagesRemoved++;
        }
    });
    // Added Pages
    newPages.forEach(s => {
        if (!oldPageMap.has(s.id)) {
            diff.pages.push({
                id: s.id,
                title: s.title,
                changeType: 'added'
            });
            diff.summary.pagesAdded++;
        }
    });
    // Modified Pages (Title, Order, etc.)
    newPages.forEach(newS => {
        const oldS = oldPageMap.get(newS.id);
        if (oldS) {
            // Check for changes
            const changes: Record<string, PropertyChange> = {};
            if (oldS.title !== newS.title) {
                changes['title'] = { oldValue: oldS.title, newValue: newS.title };
            }
            if (oldS.order !== newS.order) {
                changes['order'] = { oldValue: oldS.order, newValue: newS.order };
            }
            // Check visibility/config
            if (!_.isEqual(oldS.visibleIf, newS.visibleIf)) {
                changes['visibleIf'] = { oldValue: oldS.visibleIf, newValue: newS.visibleIf };
            }
            if (Object.keys(changes).length > 0) {
                diff.pages.push({
                    id: newS.id,
                    title: newS.title,
                    changeType: 'modified',
                    propertyChanges: changes
                });
            }
        }
    });
    // 2. Diff Steps (Blocks)
    // Assume generic 'steps' array at top level or flattened
    // The provided schema might have steps nested or flat. 
    // Assuming 'steps' is a flat array in the schema based on our previous migration work.
    // Assuming 'steps' is a flat array in the schema based on our previous migration work.
    const oldSteps = (oldSchema.steps ?? []) as DiffableStep[];
    const newSteps = (newSchema.steps ?? []) as DiffableStep[];
    const oldStepMap = new Map(oldSteps.map(s => [s.id, s]));
    const newStepMap = new Map(newSteps.map(s => [s.id, s]));
    // Removed Steps
    oldSteps.forEach(s => {
        if (!newStepMap.has(s.id)) {
            diff.steps.push({
                id: s.id,
                type: s.type,
                changeType: 'removed'
            });
            diff.summary.stepsRemoved++;
        }
    });
    // Added Steps
    newSteps.forEach(s => {
        if (!oldStepMap.has(s.id)) {
            diff.steps.push({
                id: s.id,
                type: s.type,
                changeType: 'added'
            });
            diff.summary.stepsAdded++;
        }
    });
    // Modified Steps
    newSteps.forEach(newS => {
        const oldS = oldStepMap.get(newS.id);
        if (oldS) {
            const changes: Record<string, PropertyChange> = {};
            // Core props
            if (oldS.title !== newS.title) { changes['title'] = { oldValue: oldS.title, newValue: newS.title }; }
            if (oldS.type !== newS.type) { changes['type'] = { oldValue: oldS.type, newValue: newS.type }; }
            if (oldS.required !== newS.required) { changes['required'] = { oldValue: oldS.required, newValue: newS.required }; }
            // Move check
            if (oldS.pageId !== newS.pageId) {
                changes['pageId'] = { oldValue: oldS.pageId, newValue: newS.pageId };
                // Could mark as 'moved' but treating as modified prop is often simpler
            }
            // Config deep diff
            if (!_.isEqual(oldS.config, newS.config)) {
                // We could do deep diff here, or just flag config changed
                changes['config'] = { oldValue: oldS.config, newValue: newS.config };
            }
            if (Object.keys(changes).length > 0) {
                diff.steps.push({
                    id: newS.id,
                    type: newS.type,
                    changeType: 'modified',
                    propertyChanges: changes
                });
                diff.summary.stepsModified++;
            }
        }
    });
    return diff;
}