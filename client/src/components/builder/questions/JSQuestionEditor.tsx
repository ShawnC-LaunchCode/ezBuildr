/**
 * Compute-only Code Block editor. The stored step type remains `js_question`.
 *
 * Since CB-8 this is a thin summary in the step card; the authoring surface is
 * `CodeBlockEditorModal`, which owns its own draft and its own save. The
 * `onChange`-per-keystroke path that used to run through here is gone: a save
 * that nobody awaits has nowhere to put CB-5/CB-6/CB-7's rejection message.
 */

import { cn } from "@/lib/utils";

import { JSCodeEditorSection } from "./js-question/JSCodeEditorSection";
import type { JSQuestionConfig } from "./js-question/types";

export type { JSQuestionConfig };

interface JSQuestionEditorProps {
  config: JSQuestionConfig;
  className?: string;
  elementId: string;
  pageId?: string;
  workflowId?: string;
  title?: string;
}

export function JSQuestionEditor({
  config, className, elementId, pageId, workflowId, title,
}: JSQuestionEditorProps): JSX.Element {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="border-b pb-1 text-sm font-medium text-muted-foreground">
        Code Block Configuration
      </div>

      <JSCodeEditorSection
        config={config}
        elementId={elementId}
        pageId={pageId}
        workflowId={workflowId}
        title={title}
      />
    </div>
  );
}
