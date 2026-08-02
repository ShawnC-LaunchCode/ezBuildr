/**
 * Per-field settings panel for a List field (LIST2-7).
 *
 * A list field has no `steps` row and no id to PATCH — its config lives
 * inside the parent List step's own `config` jsonb (see the Decisions
 * section of tickets/LIST_QUESTION_2_TICKETS.md). Every piece rendered here
 * is therefore controlled (`field` + `onChange`), never self-saving, unlike
 * the standalone step editors it borrows settings sections from.
 *
 * `renderTypeSettings` is the extension point LIST2-8 registers `choice`
 * into.
 */
import { ChevronDown, ChevronRight, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LogicStatusText, ConditionGroup as ConditionGroupEditor } from "@/components/logic";

import { createInitialExpression } from "@shared/types/conditions";
import type {
  ConditionExpression,
  VariableInfo,
} from "@shared/types/conditions";
import type {
  DisplayAdvancedConfig,
  DisplayConfig,
  ListField,
  MultiFieldConfig,
  ScaleAdvancedConfig,
  StepConfig,
} from "@shared/types/stepConfigs";

import { DisplayContentSection } from "../DisplayCardEditor.components";
import { MultiFieldSettingsSection } from "../MultiFieldCardEditor.components";
import type { NumberEditorConfig } from "../NumberCardEditor.components";
import { NumberSettingsSection } from "../NumberCardEditor.components";
import { ScaleSettingsSection } from "../ScaleCardEditor.components";
import { SectionHeader, SwitchField, TextAreaField } from "../common/EditorField";

type QuestionListField = Extract<ListField, { kind: "question" }>;

interface ListFieldSettingsProps {
  field: QuestionListField;
  /** This field's siblings at the same nesting level (LIST2-7 AC: `visibleIf`
   * is scoped to sibling field aliases, since an item's `visibleIf` is
   * evaluated against `item.values`, which only ever holds this level's
   * fields — see `evaluateConditionExpression` call sites in
   * `ListDrillEditor.tsx` and `BlockValidation.ts`). */
  siblingFields: readonly ListField[];
  onChange: (next: QuestionListField) => void;
}

/**
 * Renders the extracted presentational settings section for the field types
 * in LIST2-7 scope. The 11 other question types (and `choice`, LIST2-8) have
 * no per-field settings yet and fall through to `null` — they already work
 * correctly on their defaults (ticket Finding).
 */
function renderTypeSettings(field: QuestionListField, onConfigChange: (config: StepConfig) => void) {
  switch (field.type) {
    case "scale":
      return (
        <ScaleSettingsSection
          config={field.config as ScaleAdvancedConfig | undefined}
          onChange={onConfigChange}
        />
      );
    case "number":
      return (
        <NumberSettingsSection
          stepType="number"
          config={field.config as NumberEditorConfig | undefined}
          onChange={onConfigChange}
        />
      );
    case "display":
      return (
        <DisplayContentSection
          config={field.config as DisplayConfig | DisplayAdvancedConfig | undefined}
          onChange={onConfigChange}
        />
      );
    case "multi_field":
      return (
        <MultiFieldSettingsSection
          config={field.config as MultiFieldConfig | undefined}
          onChange={onConfigChange}
        />
      );
    default:
      return null;
  }
}

export function ListFieldSettings({ field, siblingFields, onChange }: ListFieldSettingsProps): JSX.Element {
  const handleConfigChange = (config: StepConfig) => onChange({ ...field, config });
  const handleDescriptionChange = (description: string) =>
    onChange({ ...field, description: description || undefined });
  const handleVisibleIfChange = (visibleIf: ConditionExpression) => onChange({ ...field, visibleIf });

  const typeSettings = renderTypeSettings(field, handleConfigChange);

  return (
    <div className="space-y-4">
      <TextAreaField
        label="Description"
        value={field.description ?? ""}
        onChange={handleDescriptionChange}
        placeholder="Optional help text shown to the respondent"
        description="Shown beneath the question when filling out this item."
        rows={2}
      />

      {typeSettings}

      <FieldVisibilitySection
        visibleIf={field.visibleIf}
        siblingFields={siblingFields}
        onChange={handleVisibleIfChange}
      />
    </div>
  );
}

/** Builds a scoped `VariableInfo` per sibling, keyed by alias (not id) so the
 * condition it produces resolves the same way the runner already evaluates
 * it: `evaluateConditionExpression(field.visibleIf, item.values)` with no
 * alias resolver, against `item.values` which is keyed by alias. */
function buildSiblingVariables(siblingFields: readonly ListField[]): VariableInfo[] {
  return siblingFields.map((sibling) => ({
    id: sibling.alias,
    alias: sibling.alias,
    label: sibling.title,
    title: sibling.title,
    // Cast mirrors the same lossy cast the workflow-level LogicBuilder makes
    // from the server's raw step-type string — unmapped types fall back to
    // short_text operators in getOperatorsForStepType, which is the existing
    // behavior this reuses rather than reinvents.
    type: (sibling.kind === "question" ? sibling.type : "list") as VariableInfo["type"],
    sectionId: "this-item",
    sectionTitle: "This item's fields",
  }));
}

/**
 * Visibility editor scoped to sibling fields at the same List level.
 *
 * Mirrors the shell of `cards/common/VisibilityField.tsx` (Collapsible +
 * `LogicStatusText` + toggle) but cannot reuse that component directly: it
 * self-saves via `useUpdateStep` against a real step id, which a list field
 * does not have (Decision #1 in the LIST2 tickets — every list-field
 * authoring component is controlled, never self-saving). This instead reuses
 * `ConditionGroup`, the same condition-tree editor `LogicBuilder` itself
 * renders, wired to a locally-scoped sibling variable list instead of a
 * `useWorkflowVariables` fetch.
 */
function FieldVisibilitySection({
  visibleIf,
  siblingFields,
  onChange,
}: {
  visibleIf: ConditionExpression | undefined;
  siblingFields: readonly ListField[];
  onChange: (expression: ConditionExpression) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const variables = useMemo(() => buildSiblingVariables(siblingFields), [siblingFields]);
  const hasConditions = Boolean(visibleIf);

  const handleToggle = (enabled: boolean) => {
    if (!enabled) {
      onChange(null);
      return;
    }
    onChange(visibleIf ?? createInitialExpression());
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-md bg-background">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-3 py-2 h-auto">
          <div className="flex items-center gap-2">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Visibility</span>
          </div>
          <div className="flex items-center gap-2">
            <LogicStatusText visibleIf={visibleIf} />
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 border-t">
        <div className="pt-3 space-y-3">
          {variables.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Add another field at this level to build a visibility condition — an item&apos;s
              visibility can only reference its own sibling fields.
            </p>
          ) : (
            <>
              <SwitchField
                label="Conditional visibility"
                description={
                  hasConditions
                    ? "Show this field only when conditions are met"
                    : "This field is always visible"
                }
                checked={hasConditions}
                onChange={handleToggle}
              />

              {hasConditions && visibleIf && (
                <div className="space-y-3">
                  <SectionHeader
                    title="Conditions"
                    description="Reference another field in this same item"
                  />
                  <ConditionGroupEditor
                    group={visibleIf}
                    variables={variables}
                    onChange={(updated) => onChange(updated)}
                    isRoot
                  />
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
