// eslint-disable-next-line @typescript-eslint/naming-convention
import _ from "lodash";

export interface PropertyChange {
    oldValue: unknown;
    newValue: unknown;
}

type StructuredChangeType = 'added' | 'removed' | 'modified' | 'moved';

export interface BlockDiff {
    id: string;
    type: string;
    changeType: StructuredChangeType;
    propertyChanges?: Record<string, PropertyChange>;
}

export interface PageDiff {
    id: string;
    title: string;
    changeType: StructuredChangeType;
    propertyChanges?: Record<string, PropertyChange>;
}

export interface SectionDiff {
    id: string;
    title: string;
    changeType: StructuredChangeType;
    propertyChanges?: Record<string, PropertyChange>;
}

export interface StructuredWorkflowDiff {
    fromVersion?: string;
    toVersion?: string;
    sections: SectionDiff[];
    pages: PageDiff[];
    steps: BlockDiff[];
    summary: {
        sectionsAdded: number;
        sectionsRemoved: number;
        sectionsModified: number;
        pagesAdded: number;
        pagesRemoved: number;
        pagesModified: number;
        stepsAdded: number;
        stepsRemoved: number;
        stepsModified: number;
    };
}

interface DiffableSection {
    id: string;
    title: string;
    description?: string | null;
    visibleIf?: unknown;
}

interface DiffablePage {
    id: string;
    title: string;
    description?: string | null;
    order?: number;
    sectionId?: string | null;
    visibleIf?: unknown;
    config?: unknown;
    steps?: DiffableStep[];
}

interface DiffableStep {
    id: string;
    type: string;
    title?: string;
    required?: boolean;
    pageId?: string;
    config?: unknown;
}

export interface DiffableWorkflowSchema {
    sections?: unknown[];
    pages?: unknown[];
    steps?: unknown[];
}

function changed(
    oldValue: Record<string, unknown>,
    newValue: Record<string, unknown>,
    keys: readonly string[],
): Record<string, PropertyChange> {
    const changes: Record<string, PropertyChange> = {};
    for (const key of keys) {
        if (!_.isEqual(oldValue[key], newValue[key])) {
            changes[key] = { oldValue: oldValue[key], newValue: newValue[key] };
        }
    }
    return changes;
}

function indexSteps(schema: DiffableWorkflowSchema): Map<string, DiffableStep> {
    const indexed = new Map<string, DiffableStep>();
    for (const step of (schema.steps ?? []) as DiffableStep[]) {
        indexed.set(step.id, step);
    }
    for (const page of (schema.pages ?? []) as DiffablePage[]) {
        for (const step of page.steps ?? []) {
            indexed.set(step.id, { ...step, pageId: step.pageId ?? page.id });
        }
    }
    return indexed;
}

function diffSections(
    diff: StructuredWorkflowDiff,
    oldSchema: DiffableWorkflowSchema,
    newSchema: DiffableWorkflowSchema,
): void {
    const oldSections = (oldSchema.sections ?? []) as DiffableSection[];
    const newSections = (newSchema.sections ?? []) as DiffableSection[];
    const oldSectionMap = new Map(oldSections.map(section => [section.id, section]));
    const newSectionMap = new Map(newSections.map(section => [section.id, section]));

    for (const section of oldSections) {
        if (!newSectionMap.has(section.id)) {
            diff.sections.push({ id: section.id, title: section.title, changeType: 'removed' });
            diff.summary.sectionsRemoved++;
        }
    }
    for (const section of newSections) {
        const oldSection = oldSectionMap.get(section.id);
        if (!oldSection) {
            diff.sections.push({ id: section.id, title: section.title, changeType: 'added' });
            diff.summary.sectionsAdded++;
            continue;
        }
        const propertyChanges = changed(
            oldSection as unknown as Record<string, unknown>,
            section as unknown as Record<string, unknown>,
            ['title', 'description', 'visibleIf'],
        );
        if (Object.keys(propertyChanges).length > 0) {
            diff.sections.push({
                id: section.id,
                title: section.title,
                changeType: 'modified',
                propertyChanges,
            });
            diff.summary.sectionsModified++;
        }
    }
}

function diffPages(
    diff: StructuredWorkflowDiff,
    oldSchema: DiffableWorkflowSchema,
    newSchema: DiffableWorkflowSchema,
): void {
    const oldPages = (oldSchema.pages ?? []) as DiffablePage[];
    const newPages = (newSchema.pages ?? []) as DiffablePage[];
    const oldPageMap = new Map(oldPages.map(page => [page.id, page]));
    const newPageMap = new Map(newPages.map(page => [page.id, page]));

    for (const page of oldPages) {
        if (!newPageMap.has(page.id)) {
            diff.pages.push({ id: page.id, title: page.title, changeType: 'removed' });
            diff.summary.pagesRemoved++;
        }
    }
    for (const page of newPages) {
        const oldPage = oldPageMap.get(page.id);
        if (!oldPage) {
            diff.pages.push({ id: page.id, title: page.title, changeType: 'added' });
            diff.summary.pagesAdded++;
            continue;
        }
        const propertyChanges = changed(
            oldPage as unknown as Record<string, unknown>,
            page as unknown as Record<string, unknown>,
            ['title', 'description', 'order', 'sectionId', 'visibleIf', 'config'],
        );
        if (Object.keys(propertyChanges).length > 0) {
            diff.pages.push({ id: page.id, title: page.title, changeType: 'modified', propertyChanges });
            diff.summary.pagesModified++;
        }
    }
}

function diffSteps(
    diff: StructuredWorkflowDiff,
    oldSchema: DiffableWorkflowSchema,
    newSchema: DiffableWorkflowSchema,
): void {
    const oldStepMap = indexSteps(oldSchema);
    const newStepMap = indexSteps(newSchema);

    for (const step of oldStepMap.values()) {
        if (!newStepMap.has(step.id)) {
            diff.steps.push({ id: step.id, type: step.type, changeType: 'removed' });
            diff.summary.stepsRemoved++;
        }
    }
    for (const step of newStepMap.values()) {
        const oldStep = oldStepMap.get(step.id);
        if (!oldStep) {
            diff.steps.push({ id: step.id, type: step.type, changeType: 'added' });
            diff.summary.stepsAdded++;
            continue;
        }
        const propertyChanges = changed(
            oldStep as unknown as Record<string, unknown>,
            step as unknown as Record<string, unknown>,
            ['title', 'type', 'required', 'pageId', 'config'],
        );
        if (Object.keys(propertyChanges).length > 0) {
            diff.steps.push({ id: step.id, type: step.type, changeType: 'modified', propertyChanges });
            diff.summary.stepsModified++;
        }
    }
}

/** Compare the published sibling Sections/Pages graph and its nested Steps. */
export function diffWorkflows(
    oldSchema: DiffableWorkflowSchema,
    newSchema: DiffableWorkflowSchema,
): StructuredWorkflowDiff {
    const diff: StructuredWorkflowDiff = {
        sections: [],
        pages: [],
        steps: [],
        summary: {
            sectionsAdded: 0,
            sectionsRemoved: 0,
            sectionsModified: 0,
            pagesAdded: 0,
            pagesRemoved: 0,
            pagesModified: 0,
            stepsAdded: 0,
            stepsRemoved: 0,
            stepsModified: 0,
        },
    };

    diffSections(diff, oldSchema, newSchema);
    diffPages(diff, oldSchema, newSchema);
    diffSteps(diff, oldSchema, newSchema);

    return diff;
}
