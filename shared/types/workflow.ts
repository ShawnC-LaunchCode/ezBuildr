import { z } from 'zod';

// Defining types locally to avoid circular dependency hell or schema import issues for now
export type BlockType =
    | "prefill"
    | "validate"
    | "branch"
    | "create_record"
    | "update_record"
    | "find_record"
    | "delete_record";

/**
 * Stored step identities. Mirrors `stepTypeEnum` exactly — STB-21 reduced both
 * to the canonical toolbox, so a retired name is no longer representable in the
 * database OR in TypeScript. Preset ids (Short Text, Yes/No, Currency, ...) are
 * a builder concern and never appear here.
 *
 * Reading a pre-backfill definition still works: `LEGACY_STEP_ADAPTERS` maps the
 * retired names on the way in. They are unwritable, not unreadable.
 */
export type StepType =
    | "text"
    | "boolean"
    | "phone"
    | "date_time"
    | "choice"
    | "email"
    | "number"
    | "scale"
    | "website"
    | "address"
    | "multi_field"
    | "display"
    | "file_upload"
    | "list"
    | "js_question"
    | "computed"
    | "final_documents"
    | "signature_block";

/** Calendars supported by the workflow-level business-day date filters. */
export const BUSINESS_DAY_CALENDARS = ['weekends-only', 'us-federal'] as const;

export type BusinessDayCalendar = typeof BUSINESS_DAY_CALENDARS[number];

/** Date-math configuration stored in the existing `workflows.settings` JSON blob. */
export interface BusinessDayWorkflowSettings {
    businessDayCalendar?: BusinessDayCalendar;
}

export const DEFAULT_BUSINESS_DAY_CALENDAR: BusinessDayCalendar = 'weekends-only';

/**
 * Resolve and validate the workflow calendar at the dynamic JSON boundary.
 * Absence is intentionally weekends-only for existing workflows.
 */
export function resolveBusinessDayCalendar(settings: unknown): BusinessDayCalendar {
    if (settings === null || settings === undefined || typeof settings !== 'object') {
        return DEFAULT_BUSINESS_DAY_CALENDAR;
    }

    const calendar = (settings as Record<string, unknown>).businessDayCalendar;
    if (calendar === undefined) {
        return DEFAULT_BUSINESS_DAY_CALENDAR;
    }
    if (calendar === 'weekends-only' || calendar === 'us-federal') {
        return calendar;
    }

    throw new Error(
        `businessDayCalendar setting must be one of "weekends-only" or "us-federal"; received ${JSON.stringify(calendar)}`
    );
}

/**
 * The same rule as `resolveBusinessDayCalendar`, for boundaries that must
 * *report* an invalid `workflows.settings` blob instead of throwing.
 *
 * The portability import is that boundary (BIZ-2): `settings` is in the import
 * field list and was written verbatim from a user-supplied bundle, so a garbage
 * calendar value survived the import and only surfaced later as a
 * document-generation failure at render time — after a run had completed, where
 * the user could no longer correct it. Validating here moves the failure to the
 * import, which is the one place it is actionable.
 *
 * Deliberately permissive about every other key. `settings` is a shared jsonb
 * blob (branding, completionMessage, redirectUrl, ...) so rejecting unknown keys
 * would break the round-trip of settings this schema knows nothing about; it
 * also accepts a non-object or absent blob, matching
 * `resolveBusinessDayCalendar`'s own treatment of those as "use the default".
 *
 * The rule is *not restated* here — it delegates, so the import-time message and
 * the render-time message are the same sentence and cannot drift apart.
 */
export const businessDaySettingsSchema = z.unknown().superRefine((settings, ctx) => {
    try {
        resolveBusinessDayCalendar(settings);
    } catch (err) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['businessDayCalendar'],
            message: err instanceof Error ? err.message : String(err),
        });
    }
});

export interface WorkflowJSON {
    id: string;
    title: string;
    pages: WorkflowPage[];
    global?: Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any; // Allow loose props
}

export interface WorkflowPage {
    id: string;
    title: string;
    blocks: WorkflowBlock[];
    order: number;
    slug?: string;
}

export interface WorkflowBlock {
    id: string;
    type: BlockType | StepType;
    title?: string;
    config?: Record<string, unknown>;
    variableName?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visibleIf?: any;
    required?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any; // Allow keys like options without lint error
}

export interface Snapshot {
    id: string;
    workflowId: string;
    name: string;
    version: number;
    inputValues: Record<string, unknown>;
    createdAt: Date;
    description?: string;
}
