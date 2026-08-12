
// Defining types locally to avoid circular dependency hell or schema import issues for now
export type BlockType =
    | "prefill"
    | "validate"
    | "branch"
    | "create_record"
    | "update_record"
    | "find_record"
    | "delete_record";

export type StepType =
    | "short_text"
    | "long_text"
    | "multiple_choice"
    | "radio"
    | "yes_no"
    | "date_time"
    | "file_upload"
    | "computed"
    | "js_question"
    | "final_documents"
    | "signature_block"
    | "true_false"
    | "phone"
    | "date"
    | "time"
    | "datetime"
    | "email"
    | "number"
    | "currency"
    | "scale"
    | "website"
    | "display"
    | "address"
    | "text"
    | "boolean"
    | "phone_advanced"
    | "datetime_unified"
    | "choice"
    | "email_advanced"
    | "number_advanced"
    | "scale_advanced"
    | "website_advanced"
    | "address_advanced"
    | "multi_field"
    | "display_advanced"
    | "final"
    | "list";

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
