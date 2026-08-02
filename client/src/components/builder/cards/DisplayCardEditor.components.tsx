import { useEffect, useState } from "react";

import type { DisplayConfig, DisplayAdvancedConfig } from "@shared/types/stepConfigs";

import { SectionHeader, TextAreaField } from "./common/EditorField";

/**
 * Presentational, save-free Display (markdown) content panel (LIST2-7).
 * Used by both the standalone `DisplayCardEditor` and, embedded, by a `display`
 * field inside a List (`ListFieldSettings`) — no `useUpdateStep` call.
 *
 * Only `markdown` is authored here, matching the standalone editor's existing
 * (unchanged) behavior: an advanced-mode display block's extra fields
 * (`allowHtml`, `template`, `style`, ...) are preserved on-wire but not
 * editable through this panel today.
 */
export function DisplayContentSection({
  config,
  onChange,
}: {
  config: (DisplayConfig | DisplayAdvancedConfig) | undefined;
  onChange: (config: DisplayConfig) => void;
}): JSX.Element {
  const [localConfig, setLocalConfig] = useState({
    markdown: config?.markdown ?? "",
  });

  useEffect(() => {
    setLocalConfig({
      markdown: config?.markdown ?? "",
    });
  }, [config]);

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    const configToSave: DisplayConfig = {
      markdown: newConfig.markdown,
    };

    onChange(configToSave);
  };

  return (
    <div className="space-y-4">
      {/* Markdown Content */}
      <div className="space-y-3">
        <SectionHeader
          title="Content"
          description="Enter markdown content to display"
        />

        <TextAreaField
          label="Markdown"
          value={localConfig.markdown}
          onChange={(val) => handleUpdate({ markdown: val })}
          placeholder="# Welcome\n\nThis is a **display block** that shows formatted content."
          description="Supports markdown formatting"
          rows={12}
          required
        />
      </div>

      {/* Markdown Help */}
      <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
        <p className="font-medium mb-2">Markdown Syntax:</p>
        <div className="space-y-1 font-mono">
          <div><span className="text-foreground"># Heading 1</span></div>
          <div><span className="text-foreground">## Heading 2</span></div>
          <div><span className="text-foreground">**bold text**</span></div>
          <div><span className="text-foreground">*italic text*</span></div>
          <div><span className="text-foreground">- List item</span></div>
          <div><span className="text-foreground">[link](https://example.com)</span></div>
          <div className="mt-2 font-sans">
            Variable interpolation: <code className="font-mono">{`{{variableName}}`}</code>
          </div>
        </div>
      </div>

      {/* Preview Info */}
      <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-md border border-blue-200 dark:border-blue-800">
        <p className="font-medium mb-1">ℹ️ Display Block Behavior:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>No user input required</li>
          <li>Does not create a variable</li>
          <li>Use for instructions, headers, or informational content</li>
          <li>Can reference other variables using <code className="font-mono">{`{{alias}}`}</code></li>
        </ul>
      </div>
    </div>
  );
}
