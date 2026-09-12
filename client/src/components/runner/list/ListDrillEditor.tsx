/**
 * The drilled-in item editor for the runner's List block (LIST-8). Rendered
 * by WorkflowRunner.tsx in place of the whole page body while a List step
 * is drilled into — not just in place of the ListBlock — per the design:
 * drilling replaces the page body, with a breadcrumb and its own
 * back/Done controls instead of the page's Back/Next.
 */
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { BlockErrorBoundary } from "@/components/runner/BlockErrorBoundary";
import { BlockRenderer } from "@/components/runner/blocks/BlockRenderer";
import { Button } from "@/components/ui/button";
import type { ApiStep } from "@/lib/vault-api";
import type { RunnerAnswerDefinitions } from "@/components/runner/runnerInterpolation";

import { evaluateConditionExpression } from "@shared/conditionEvaluator";
import { validateListValue } from "@shared/validation/BlockValidation";
import type { ListField, ListValue } from "@shared/types/stepConfigs";

import { useListDrill, type ListDrillState } from "./ListDrillContext";
import { ListItemsView } from "./ListItemsView";
import {
  normalizeListConfig,
  normalizeListValue,
  pendingDrillReturnFocus,
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
  runId?: string;
  runToken?: string | null;
}

function fieldToStep(field: Extract<ListField, { kind: "question" }>, parent: ApiStep): ApiStep {
  return {
    id: field.id,
    workflowId: parent.workflowId,
    pageId: parent.pageId,
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

export function ListDrillEditor({ step, value, onChange, drill, aliasMap, runId, runToken }: ListDrillEditorProps) {
  const { popOne, pushSegment, clearAutoFocus } = useListDrill();
  const fieldsContainerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Tracks which item the effect below last acted on, so that clearing
  // `autoFocusFirstField` (which re-fires the same effect, since it's in the
  // dependency array, for the SAME item) doesn't get mistaken for a genuine
  // depth change and steal focus back to the heading.
  const lastHandledItemIdRef = useRef<string | undefined>(undefined);

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
    const isNewItem = lastHandledItemIdRef.current !== scope.item.itemId;
    lastHandledItemIdRef.current = scope.item.itemId;

    if (shouldAutoFocus && fieldsContainerRef.current) {
      const firstFocusable = fieldsContainerRef.current.querySelector<HTMLElement>(
        "input, textarea, select, button, [tabindex]"
      );
      firstFocusable?.focus();
      clearAutoFocus();
    } else if (isNewItem) {
      // LIST2-12: every other depth change — entering a level, or leaving one
      // while staying drilled in (still mounted, just shallower) — moves
      // focus to this level's own heading instead of leaving it on a button
      // that no longer exists (or, worse, silently on nothing). The heading's
      // text IS the current breadcrumb, so its accessible name updates for
      // free on every transition. Gated on `isNewItem` (not just "not
      // auto-focusing") so that clearing `autoFocusFirstField` — which
      // re-fires this same effect for the SAME item — doesn't yank focus off
      // the field "+ Add" just placed it on.
      headingRef.current?.focus();
    }
    // Recorded on every depth change (including the "+ Add" one) so that if
    // the drill later closes ENTIRELY — unmounting this component outright,
    // rather than just shrinking `scope` — whichever `ListItemsView` mounts
    // back in its place can hand focus back to the matching row instead of
    // letting it fall through to document.body. See pendingDrillReturnFocus.
    pendingDrillReturnFocus.itemId = scope.item.itemId;
  }, [scope?.item.itemId, shouldAutoFocus]);

  if (!scope) {
    return null;
  }

  const liveLabels = resolveBreadcrumbLabels(rootConfig, rootValue, drill.segments);
  const parentLabel = liveLabels.length > 1 ? liveLabels[liveLabels.length - 2] : step.title;
  const breadcrumb = [step.title, ...liveLabels].join(" › ");

  const fields = [...scope.config.fields].sort((a, b) => a.order - b.order);
  const localAliasMap = { ...aliasMap };
  const localAnswerDefinitions: RunnerAnswerDefinitions = {};
  for (const field of fields) {
    localAliasMap[field.alias] = field.alias;
    if (field.kind === "question") {
      localAnswerDefinitions[field.alias] = { type: field.type, config: field.config };
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <Button type="button" variant="ghost" size="sm" onClick={popOne}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          {parentLabel}
        </Button>
        {/*
          A real heading (not a <p>) so it can be the focus target on every
          drill depth change (LIST2-12 AC1/AC2) and so its text — already the
          full breadcrumb — doubles as an accessible name for the context
          change (AC3), with no new visible text. `tabIndex={-1}` makes it
          programmatically focusable without adding it to the tab order.
          Classes are unchanged from the previous <p>, so this is a tag swap
          only — no visual delta (AC5).
        */}
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="truncate text-sm text-muted-foreground"
          title={breadcrumb}
        >
          {breadcrumb}
        </h2>
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
                  aliasMap={localAliasMap}
                  answerDefinitions={localAnswerDefinitions}
                  runId={runId}
                  runToken={runToken}
                  runStepId={step.id}
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
