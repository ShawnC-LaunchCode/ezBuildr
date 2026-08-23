export type WorkflowLintCategory = "questions" | "logic" | "documents" | "integrations";

export type WorkflowLintBuilderTab =
  | "pages"
  | "templates"
  | "data-sources"
  | "settings"
  | "map"
  | "review"
  | "snapshots";

export interface WorkflowLintTarget {
  tab: WorkflowLintBuilderTab;
  pageId?: string;
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
