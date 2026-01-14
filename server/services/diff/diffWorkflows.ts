
import { diff as deepDiff } from "deep-object-diff";
import _ from "lodash";

import { WorkflowSchema } from "../migrations/registry";

export interface PropertyChange {
    oldValue: any;
    newValue: any;
}

export interface BlockDiff {
    id: string;
    type: string;
    changeType: 'added' | 'removed' | 'modified' | 'moved';
    propertyChanges?: Record<string, PropertyChange>;
}

export interface SectionDiff {
    id: string;
    title: string;
    changeType: 'added' | 'removed' | 'modified' | 'moved';
    propertyChanges?: Record<string, PropertyChange>;
}

export interface WorkflowDiff {
    fromVersion?: string;
    toVersion?: string;
    sections: SectionDiff[];
    steps: BlockDiff[];
    summary: {
        sectionsAdded: number;
        sectionsRemoved: number;
        stepsAdded: number;
        stepsRemoved: number;
        stepsModified: number;
    };
}

/**
 * Compare two workflow schemas and generate a structured diff.
 */
export function diffWorkflows(oldSchema: WorkflowSchema, newSchema: WorkflowSchema): WorkflowDiff {
    const diff: WorkflowDiff = {
        sections: [],
        steps: [],
        summary: {
            sectionsAdded: 0,
            sectionsRemoved: 0,
            stepsAdded: 0,
            stepsRemoved: 0,
            stepsModified: 0
        }
    };

    // 1. Diff Sections
    const oldSections = oldSchema.sections || [];
    const newSections = newSchema.sections || [];

    const oldSectionMap = new Map(oldSections.map(s => [s.id, s]));
    const newSectionMap = new Map(newSections.map(s => [s.id, s]));

    // Removed Sections
    oldSections.forEach(s => {
        if (!newSectionMap.has(s.id)) {
            diff.sections.push({
                id: s.id,
                title: s.title,
                changeType: 'removed'
            });
            diff.summary.sectionsRemoved++;
        }
    });

    // Added Sections
    newSections.forEach(s => {
        if (!oldSectionMap.has(s.id)) {
            diff.sections.push({
                id: s.id,
                title: s.title,
                changeType: 'added'
            });
            diff.summary.sectionsAdded++;
        }
    });

    // Modified Sections (Title, Order, etc.)
    newSections.forEach(newS => {
        const oldS = oldSectionMap.get(newS.id);
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
                diff.sections.push({
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
    const oldSteps = oldSchema.steps || [];
    const newSteps = newSchema.steps || [];

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
            if (oldS.title !== newS.title) {changes['title'] = { oldValue: oldS.title, newValue: newS.title };}
            if (oldS.type !== newS.type) {changes['type'] = { oldValue: oldS.type, newValue: newS.type };}
            if (oldS.required !== newS.required) {changes['required'] = { oldValue: oldS.required, newValue: newS.required };}

            // Move check
            if (oldS.sectionId !== newS.sectionId) {
                changes['sectionId'] = { oldValue: oldS.sectionId, newValue: newS.sectionId };
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
