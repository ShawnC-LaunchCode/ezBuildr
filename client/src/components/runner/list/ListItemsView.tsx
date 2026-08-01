/**
 * Collapsed item-rows view for a List value (LIST-8). Reused at every
 * nesting level: for the top-level list step's own body (ListBlock.tsx) and,
 * recursively, for any nested `kind: "list"` field encountered while drilled
 * into an item (ListDrillEditor.tsx) — both just need "show these items, let
 * the respondent add/open/delete/reorder one."
 */
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { validateListValue } from "@shared/validation/BlockValidation";
import type { ListConfig, ListItem, ListValue } from "@shared/types/stepConfigs";

import {
  addItem,
  countNestedItemsRecursive,
  describeNestedCounts,
  hasItemError,
  removeItem,
  reorderItems,
  resolveItemLabel,
} from "./listRuntime";

interface OpenItemOptions {
  autoFocus?: boolean;
  /**
   * Set only by "+ Add": the caller's `onChange(nextValue)` and this
   * `onOpenItem` call happen in the same synchronous tick, before React
   * re-renders — the parent's own `value`/`config` closure is one render
   * behind and would resolve the new item's label from a lookup that can't
   * find it yet (index -1). Passing the already-resolved label sidesteps
   * that race entirely instead of asking every caller to work around it.
   */
  label?: string;
}

interface ListItemsViewProps {
  config: ListConfig;
  value: ListValue;
  onChange: (value: ListValue) => void;
  onOpenItem: (itemId: string, options?: OpenItemOptions) => void;
  readOnly?: boolean;
}

export function ListItemsView({ config, value, onChange, onOpenItem, readOnly }: ListItemsViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [pendingDelete, setPendingDelete] = useState<ListItem | null>(null);

  // Live, not gated behind a "Next was clicked" flag — Decision 4 treats the
  // badge as an always-current completeness indicator. Recomputing from the
  // current value+config on every render (not a stale snapshot) is also what
  // makes fixing a field clear its badge immediately (LIST-9 AC7): the fixed
  // path simply stops appearing in this same recursive result.
  const errors = useMemo(() => validateListValue(value, config), [value, config]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = value.items.findIndex((item) => item.itemId === active.id);
      const newIndex = value.items.findIndex((item) => item.itemId === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onChange(reorderItems(value, oldIndex, newIndex));
      }
    }
  };

  const handleAdd = () => {
    const { value: nextValue, item } = addItem(value, config);
    onChange(nextValue);
    const label = resolveItemLabel(item, config, `Item ${value.items.length + 1}`);
    onOpenItem(item.itemId, { autoFocus: true, label });
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      onChange(removeItem(value, pendingDelete.itemId));
      setPendingDelete(null);
    }
  };

  const atMax = config.maxItems != null && value.items.length >= config.maxItems;
  const nestedCount =
    pendingDelete && countNestedItemsRecursive(pendingDelete, config) > 0
      ? describeNestedCounts(pendingDelete, config)
      : null;

  return (
    <div className="space-y-2">
      {value.items.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          {config.emptyStateText ?? "No items yet."}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={value.items.map((item) => item.itemId)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {value.items.map((item, index) => (
                <ListItemRow
                  key={item.itemId}
                  item={item}
                  config={config}
                  index={index}
                  allowReorder={Boolean(config.allowReorder) && !readOnly}
                  readOnly={readOnly}
                  hasError={hasItemError(errors, index)}
                  onOpen={() => { onOpenItem(item.itemId); }}
                  onDelete={() => { setPendingDelete(item); }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {!readOnly && (
        <Button type="button" variant="outline" size="sm" onClick={handleAdd} disabled={atMax}>
          <Plus className="mr-1 h-4 w-4" />
          {config.addButtonText ?? "Add item"}
        </Button>
      )}
      {atMax && (
        <p className="text-xs text-muted-foreground">Maximum {config.maxItems} items reached.</p>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) { setPendingDelete(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              {nestedCount
                ? `This will also remove its nested data: ${nestedCount}.`
                : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ListItemRowProps {
  item: ListItem;
  config: ListConfig;
  index: number;
  allowReorder: boolean;
  readOnly?: boolean;
  hasError?: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

function ListItemRow({ item, config, index, allowReorder, readOnly, hasError, onOpen, onDelete }: ListItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.itemId });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const label = resolveItemLabel(item, config, `Item ${index + 1}`);
  const nestedSummary = describeNestedCounts(item, config);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border bg-background p-2 ${isDragging ? "opacity-50" : ""}`}
    >
      {allowReorder && (
        <button
          type="button"
          className="cursor-grab p-1 text-muted-foreground active:cursor-grabbing"
          aria-label={`Reorder ${label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        className="flex flex-1 items-center justify-between gap-2 py-1 text-left"
        onClick={onOpen}
      >
        <span className="flex-1 truncate text-sm font-medium">{label}</span>
        {hasError && (
          <span className="flex shrink-0 items-center text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Incomplete or invalid</span>
          </span>
        )}
        {nestedSummary && <span className="shrink-0 text-xs text-muted-foreground">{nestedSummary}</span>}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={`Delete ${label}`}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
