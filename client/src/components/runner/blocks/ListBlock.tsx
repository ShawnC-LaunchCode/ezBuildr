/**
 * ListBlockRenderer - the collapsed, inline view of a `list` step (LIST-8).
 *
 * Only renders the item rows + "Add" — the moment an item is opened,
 * WorkflowRunner.tsx swaps the whole section body for ListDrillEditor
 * instead (drilling replaces the section body, not just this block). This
 * component's only job is to start that drill.
 */
import { useListDrill } from "@/components/runner/list/ListDrillContext";
import { ListItemsView } from "@/components/runner/list/ListItemsView";
import { normalizeListValue, resolveItemLabel } from "@/components/runner/list/listRuntime";
import type { Step } from "@/types";

import type { ListConfig, ListValue } from "@shared/types/stepConfigs";

export interface ListBlockProps {
  step: Step;
  value: ListValue | null | undefined;
  onChange: (value: ListValue) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
}

export function ListBlockRenderer({ step, value, onChange, readOnly }: ListBlockProps) {
  const { enterList } = useListDrill();
  const config = step.config as ListConfig;
  const listValue = normalizeListValue(value);

  const handleOpenItem = (itemId: string, options?: { autoFocus?: boolean; label?: string }) => {
    let label = options?.label;
    if (label === undefined) {
      const itemIndex = listValue.items.findIndex((candidate) => candidate.itemId === itemId);
      const fallback = `Item ${itemIndex + 1}`;
      label = itemIndex === -1 ? fallback : resolveItemLabel(listValue.items[itemIndex], config, fallback);
    }
    enterList(step.id, { fieldAlias: null, itemId, label, autoFocusFirstField: options?.autoFocus });
  };

  return (
    <ListItemsView
      config={config}
      value={listValue}
      onChange={onChange}
      onOpenItem={handleOpenItem}
      readOnly={readOnly}
    />
  );
}
