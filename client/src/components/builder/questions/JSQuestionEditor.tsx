/**
 * Compute-only Code Block editor. The stored step type remains `js_question`.
 */

import { useState, useEffect } from "react";

import { HelperLibraryDocs } from "@/components/builder/HelperLibraryDocs";
import { cn } from "@/lib/utils";

import { JSCodeEditorSection } from "./js-question/JSCodeEditorSection";
import type { JSQuestionConfig } from "./js-question/types";

export type { JSQuestionConfig };

interface JSQuestionEditorProps {
  config: JSQuestionConfig;
  onChange: (config: JSQuestionConfig) => void;
  className?: string;
  elementId: string;
  workflowId?: string; // For variable picker
}

export function JSQuestionEditor({ config, onChange, className, elementId, workflowId }: JSQuestionEditorProps): JSX.Element {
  const [localConfig, setLocalConfig] = useState<JSQuestionConfig>(config);

  // Sync with external changes
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);


  const handleComponentChange = (updates: Partial<JSQuestionConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="text-sm font-medium text-muted-foreground border-b pb-1">
        Code Block Configuration
      </div>

      <JSCodeEditorSection
        config={localConfig}
        onChange={handleComponentChange}
        elementId={elementId}
        workflowId={workflowId}
      />

      {/* Helper Library Documentation */}
      <HelperLibraryDocs />
    </div>
  );
}
