import { FolderOpen } from "lucide-react";

/**
 * Shown in place of a template grid when the workflow has no project
 * (`workflow.projectId == null`). Document templates are project assets, so
 * there is no safe pool to list/upload against until the workflow is filed.
 * See ICW2-B8: previously this silently fell back to the user's newest
 * project (`projects[0]`), which read/wrote an unrelated project's templates.
 */
export function UnfiledWorkflowNotice() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed rounded-lg bg-slate-50/50">
      <FolderOpen className="w-10 h-10 text-muted-foreground mb-4 opacity-50" />
      <p className="text-sm text-muted-foreground font-medium">No project context found.</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Please save the workflow to a project first. Document templates are managed per project.
      </p>
    </div>
  );
}
