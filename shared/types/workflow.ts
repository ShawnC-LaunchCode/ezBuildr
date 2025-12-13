
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
    | "loop_group"
    | "computed"
    | "js_question"
    | "repeater"
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
    | "final";

export interface WorkflowJSON {
    id: string;
    title: string;
    pages: WorkflowPage[];
    global?: Record<string, any>;
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
    config?: Record<string, any>;
    variableName?: string;
    visibleIf?: any;
    required?: boolean;
    [key: string]: any; // Allow keys like options without lint error
}

export interface Snapshot {
    id: string;
    workflowId: string;
    name: string;
    version: number;
    inputValues: Record<string, any>;
    createdAt: Date;
    description?: string;
}
