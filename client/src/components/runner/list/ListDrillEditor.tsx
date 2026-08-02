/**
 * The drilled-in item editor for the runner's List block (LIST-8). Rendered
 * by WorkflowRunner.tsx in place of the whole section body while a List step
 * is drilled into — not just in place of the ListBlock — per the design:
 * drilling replaces the section body, with a breadcrumb and its own
 * back/Done controls instead of the section's Back/Next.
 */
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { BlockErrorBoundary } from "@/components/runner/BlockErrorBoundary";
import { BlockRenderer } from "@/components/runner/blocks/BlockRenderer";
import { Button } from "@/components/ui/button";
import type { ApiStep } from "@/lib/vault-api";

import { evaluateConditionExpression } from "@shared/conditionEvaluator";
import { validateListValue } from "@shared/validation/BlockValidation";
import type { ListField, ListValue } from "@shared/types/stepConfigs";

import { useListDrill, type ListDrillState } from "./ListDrillContext";
import { ListItemsView } from "./ListItemsView";
import {
  normalizeListConfig,
  normalizeListValue,
  resolveBreadcrumbLabels,
  resolveDrillScope,
  resolveItemLabel,
  setFieldValueAtScope,
} from "./listRuntime";

interface ListDrillEditorProps {
  step: ApiStep;
  value: ListValue | null | undefined;
  onChange: (value: ListValue) => void;
  drill: ListDrillState;
  aliasMap?: Record<string, string>;
}

function fieldToStep(field: Extract<ListField, { kind: "question" }>, parent: ApiStep): ApiStep {
  return {
    id: field.id,
    workflowId: parent.workflowId,
    sectionId: parent.sectionId,
    type: field.type,
    title: field.title,
    description: field.description ?? null,
    required: field.required ?? false,
    alias: field.alias,
    order: field.order,
    isVirtual: false,
    config: (field.config as Record<string, unknown> | undefined) ?? null,
    createdAt: parent.createdAt,
  };
}

export function ListDrillEditor({ step, value, onChange, drill, aliasMap }: ListDrillEditorProps) {
  const { popOne, pushSegment, clearAutoFocus } = useListDrill();
  const fieldsContainerRef = useRef<HTMLDivElement>(null);

  const rootConfig = normalizeListConfig(step.config);
  const rootValue = normalizeListValue(value);
  const scope = resolveDrillScope(rootConfig, rootValue, drill.segments);

  // Live per-field errors for the currently-open item (LIST-9 AC2/AC7):
  // validated as a synthetic one-item list ({ items: [scope.item] }) so the
  // exact same validateListValue used everywhere else in this feature keys a
  // field's error at "[0].<alias>" — no separate path-resolution needed for
  // the item currently being edited. Recomputed on every render from the
  // current values, so fixing a field clears its own message immediately.
  const itemErrors = useMemo(
    () => (scope ? validateListValue({ items: [scope.item] }, scope.config) : {}),
    [scope]
  );

  const lastSegment = drill.segments[drill.segments.length - 1];
  const shouldAutoFocus = Boolean(lastSegment?.autoFocusFirstField);

  useEffect(() => {
    if (!scope) {
      // The stack no longer matches the data (e.g. the item was deleted from
      // another tab/session mid-edit) — back out one level rather than
      // rendering a broken editor.
      popOne();
      return;
    }
    if (shouldAutoFocus && fieldsContainerRef.current) {
      const firstFocusable = fieldsContainerRef.current.querySelector<HTMLElement>(
        "input, textarea, select, button, [tabindex]"
      );
      firstFocusable?.focus();
      clearAutoFocus();
    }
  }, [scope?.item.itemId, shouldAutoFocus]);

  if (!scope) {
    return null;
  }

  const liveLabels = resolveBreadcrumbLabels(rootConfig, rootValue, drill.segments);
  const parentLabel = liveLabels.length > 1 ? liveLabels[liveLabels.length - 2] : step.title;
  const breadcrumb = [step.title, ...liveLabels].join(" › ");

  const fields = [...scope.config.fields].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <Button type="button" variant="ghost" size="sm" onClick={popOne}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          {parentLabel}
        </Button>
        <p className="truncate text-sm text-muted-foreground" title={breadcrumb}>{breadcrumb}</p>
      </div>

      <div ref={fieldsContainerRef} className="space-y-6">
        {fields.map((field) => {
          if (field.kind === "question") {
            if (!evaluateConditionExpression(field.visibleIf ?? null, scope.item.values)) {
              return null;
            }
            const fieldMessages = itemErrors[`[0].${field.alias}`];
            return (
              <BlockErrorBoundary key={field.id} stepId={field.id}>
                <BlockRenderer
                  step={fieldToStep(field, step)}
                  value={scope.item.values[field.alias]}
                  onChange={(fieldValue) => {
                    onChange(setFieldValueAtScope(rootValue, drill.segments, field.alias, fieldValue));
                  }}
                  required={field.required}
                  error={fieldMessages?.[0]}
                  showValidation={Boolean(fieldMessages?.length)}
                  context={scope.item.values}
                  aliasMap={aliasMap}
                />
              </BlockErrorBoundary>
            );
          }

          const nestedValue = normalizeListValue(scope.item.values[field.alias]);
          return (
            <div key={field.id} className="space-y-2">
              <p className="text-sm font-medium">{field.title}</p>
              {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}
              <ListItemsView
                config={field.list}
                value={nestedValue}
                onChange={(next) => {
                  onChange(setFieldValueAtScope(rootValue, drill.segments, field.alias, next));
                }}
                onOpenItem={(itemId, options) => {
                  let label = options?.label;
                  if (label === undefined) {
                    const itemIndex = nestedValue.items.findIndex((item) => item.itemId === itemId);
                    const fallback = `Item ${itemIndex + 1}`;
                    label = itemIndex === -1 ? fallback : resolveItemLabel(nestedValue.items[itemIndex], field.list, fallback);
                  }
                  pushSegment({ fieldAlias: field.alias, itemId, label, autoFocusFirstField: options?.autoFocus });
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button type="button" onClick={popOne}>Done</Button>
      </div>
    </div>
  );
}
