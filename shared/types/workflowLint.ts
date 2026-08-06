export type WorkflowLintCategory = "questions" | "logic" | "documents" | "integrations";

export type WorkflowLintBuilderTab =
  | "sections"
  | "templates"
  | "data-sources"
  | "settings";

export interface WorkflowLintTarget {
  tab: WorkflowLintBuilderTab;
  sectionId?: string;
  stepId?: string;
  blockId?: string;
  panel?: "logic";
}

export interface WorkflowLintIssue {
  type: "error" | "warning";
  category: WorkflowLintCategory;
  message: string;
  target: WorkflowLintTarget;
}
