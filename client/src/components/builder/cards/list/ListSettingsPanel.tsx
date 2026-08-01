import { ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import type { ListConfig } from "@shared/types/stepConfigs";

import { NumberField, SwitchField, TextField } from "../common/EditorField";

interface ListSettingsPanelProps {
  config: ListConfig;
  onChange: (config: ListConfig) => void;
  /** 1-indexed nesting level this settings panel belongs to — only used to pick the default open/closed state. */
  depth: number;
  /** This level's own field aliases, shown as a hint for writing `labelTemplate`. */
  fieldAliases: string[];
}

function bracedAlias(alias: string): string {
  return `{${alias}}`;
}

/**
 * minItems/maxItems/labelTemplate/addButtonText/allowReorder/emptyStateText —
 * the settings that live on `ListConfig` at every nesting level (LIST-2).
 * Collapsed by default below the top level so a deep tree doesn't swamp the
 * panel with settings nobody is looking at.
 */
export function ListSettingsPanel({ config, onChange, depth, fieldAliases }: ListSettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(depth === 1);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-md bg-background">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-3 py-2 h-auto">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">List settings</span>
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 border-t">
        <div className="pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Minimum items"
              value={config.minItems}
              onChange={(minItems) => onChange({ ...config, minItems })}
              min={0}
              placeholder="No minimum"
            />
            <NumberField
              label="Maximum items"
              value={config.maxItems}
              onChange={(maxItems) => onChange({ ...config, maxItems })}
              min={0}
              placeholder="No maximum"
            />
          </div>

          <TextField
            label="Item label template"
            value={config.labelTemplate ?? ""}
            onChange={(labelTemplate) => onChange({ ...config, labelTemplate: labelTemplate || undefined })}
            placeholder={fieldAliases[0] ? `e.g. {${fieldAliases[0]}}` : "e.g. {firstName} {lastName}"}
            description={
              fieldAliases.length > 0
                ? `Available at this level: ${fieldAliases.map(bracedAlias).join(", ")}`
                : "Shown as each item's row label."
            }
          />

          <TextField
            label="Add button text"
            value={config.addButtonText ?? ""}
            onChange={(addButtonText) => onChange({ ...config, addButtonText: addButtonText || undefined })}
            placeholder="Add item"
          />

          <TextField
            label="Empty state text"
            value={config.emptyStateText ?? ""}
            onChange={(emptyStateText) => onChange({ ...config, emptyStateText: emptyStateText || undefined })}
            placeholder="No items yet"
          />

          <SwitchField
            label="Allow respondents to reorder items"
            checked={config.allowReorder ?? false}
            onChange={(allowReorder) => onChange({ ...config, allowReorder })}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
