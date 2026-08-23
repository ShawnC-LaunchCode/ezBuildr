/**
 * Pure runtime helpers for the runner's List block (LIST-8). No React —
 * item CRUD, label/summary resolution, and path-based reads/writes through
 * an arbitrarily nested drill stack. Mirrors the authoring-time pure module
 * client/src/components/builder/cards/list/listEditorHelpers.ts, but that
 * module edits field *definitions* (ListField[]); this one edits item
 * *values* (ListValue/ListItem) at runtime, which has no overlap with it.
 */
import type { ListValidationErrors } from "@shared/validation/BlockValidation";
import { resolveItemLabel } from "@shared/types/stepConfigs";
import type { ListConfig, ListField, ListItem, ListValue } from "@shared/types/stepConfigs";

export { resolveItemLabel };

export function emptyListValue(): ListValue {
  return { items: [] };
}

/** `step.config`/a nested field's stored value is jsonb — never trust its shape. */
export function normalizeListValue(value: unknown): ListValue {
  if (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { items?: unknown }).items)
  ) {
    return value as ListValue;
  }
  return emptyListValue();
}

/**
 * `step.config` for a `list` step (or a nested field's own `list` config) is
 * jsonb — never trust its shape at read time. LIST2-3 adds server-side
 * structural validation on write, but existing rows and any bypass of it
 * must still degrade to an empty list rather than throwing when a consumer
 * does `[...config.fields]`.
 */
export function normalizeListConfig(config: unknown): ListConfig {
  if (
    typeof config === "object" &&
    config !== null &&
    Array.isArray((config as { fields?: unknown }).fields)
  ) {
    return config as ListConfig;
  }
  return { fields: [] };
}

function defaultFieldValue(field: ListField): unknown {
  return field.kind === "list" ? emptyListValue() : undefined;
}

/**
 * Every nested `kind: "list"` field must start as `{ items: [] }`, not
 * absent — `validateListValue` (LIST-3) rejects an absent/undefined nested
 * list field as malformed, it does not treat "never touched" as empty.
 */
export function createItemValues(config: ListConfig): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of config.fields) {
    values[field.alias] = defaultFieldValue(field);
  }
  return values;
}

export function createListItem(config: ListConfig): ListItem {
  return { itemId: crypto.randomUUID(), values: createItemValues(config) };
}

export function addItem(value: ListValue, config: ListConfig): { value: ListValue; item: ListItem } {
  const item = createListItem(config);
  return { value: { items: [...value.items, item] }, item };
}

export function removeItem(value: ListValue, itemId: string): ListValue {
  return { items: value.items.filter((item) => item.itemId !== itemId) };
}

export function reorderItems(value: ListValue, oldIndex: number, newIndex: number): ListValue {
  const items = [...value.items];
  const [moved] = items.splice(oldIndex, 1);
  if (moved === undefined) {
    return value;
  }
  items.splice(newIndex, 0, moved);
  return { items };
}

/** e.g. "2 addresses" for the item row's nested-count summary. Null when the item has no nested list fields. */
export function describeNestedCounts(item: ListItem, config: ListConfig): string | null {
  const listFields = config.fields.filter(
    (field): field is Extract<ListField, { kind: "list" }> => field.kind === "list"
  );
  if (listFields.length === 0) {
    return null;
  }
  return listFields
    .map((field) => {
      const nested = normalizeListValue(item.values[field.alias]);
      return `${nested.items.length} ${field.title.toLowerCase()}`;
    })
    .join(", ");
}

/** Total item count across this item's nested lists, recursively — used for the delete-confirm "this will also remove N nested items" copy. */
export function countNestedItemsRecursive(item: ListItem, config: ListConfig): number {
  let total = 0;
  for (const field of config.fields) {
    if (field.kind !== "list") {
      continue;
    }
    const nested = normalizeListValue(item.values[field.alias]);
    total += nested.items.length;
    for (const nestedItem of nested.items) {
      total += countNestedItemsRecursive(nestedItem, field.list);
    }
  }
  return total;
}

/**
 * One level of the drill stack. `fieldAlias` names the `kind: "list"` field
 * (within the PREVIOUS segment's item, or the root step's own config for the
 * first segment) that was drilled into; `itemId` is the item chosen inside
 * it. `autoFocusFirstField` is set only on a segment created by "+ Add", so
 * the drilled editor can focus the first field once and then clear it.
 */
export interface DrillSegment {
  fieldAlias: string | null;
  itemId: string;
  label: string;
  autoFocusFirstField?: boolean;
}

export interface DrillScope {
  config: ListConfig;
  value: ListValue;
  item: ListItem;
}

/**
 * One-shot cross-mount focus handoff for the runner's list drill-in
 * (LIST2-12). `ListDrillEditor` and the collapsed `ListItemsView` (rendered
 * standalone via `ListBlockRenderer`) are never mounted at the same time —
 * WorkflowRunner swaps one for the other at the same JSX slot, so entering or
 * leaving the drill is a genuine unmount + mount, not a re-render either
 * component can observe. Ordinary React state or context can't carry a "focus
 * this row" instruction across that boundary; this tiny mutable handoff can,
 * because it lives at module scope rather than in either component's own
 * lifecycle. `ListDrillEditor` records the current item's id here on every
 * level change; whichever `ListItemsView` instance mounts next claims it
 * (reads + clears) if one of its own rows matches, and no-ops otherwise. Only
 * one list can be drilled into at a time (see `ListDrillContext`'s header
 * comment) and item ids are unique, so there is no cross-list leakage.
 */
export const pendingDrillReturnFocus: { itemId: string | null } = { itemId: null };

/** Walks the drill stack from the root down to the currently-open item. Returns null if the stack no longer matches the data (e.g. the item was deleted from under it). */
export function resolveDrillScope(
  rootConfig: ListConfig,
  rootValue: ListValue,
  segments: readonly DrillSegment[]
): DrillScope | null {
  let config = rootConfig;
  let value = rootValue;
  let item: ListItem | undefined;

  for (let depth = 0; depth < segments.length; depth += 1) {
    const segment = segments[depth];
    item = value.items.find((candidate) => candidate.itemId === segment.itemId);
    if (!item) {
      return null;
    }
    if (depth + 1 < segments.length) {
      const nextSegment = segments[depth + 1];
      const field = config.fields.find(
        (candidate): candidate is Extract<ListField, { kind: "list" }> =>
          candidate.kind === "list" && candidate.alias === nextSegment.fieldAlias
      );
      if (!field) {
        return null;
      }
      config = field.list;
      value = normalizeListValue(item.values[field.alias]);
    }
  }

  return item ? { config, value, item } : null;
}

/**
 * Labels for the breadcrumb, one per segment, resolved fresh from the
 * CURRENT data rather than reusing the frozen `segment.label` — an ancestor
 * item's name may have been typed in after it was drilled into (e.g. enter
 * a child unnamed, drill into its addresses, then the breadcrumb must show
 * the name once it exists, not the "Item 1" placeholder from creation time).
 * `segment.label` is kept only as the fallback for an item that still
 * resolves blank. Returns one fewer label than `segments` where the stack no
 * longer matches the data (caller's `resolveDrillScope` already handles that
 * case by closing the drill).
 */
export function resolveBreadcrumbLabels(
  rootConfig: ListConfig,
  rootValue: ListValue,
  segments: readonly DrillSegment[]
): string[] {
  const labels: string[] = [];
  let config = rootConfig;
  let value = rootValue;

  for (let depth = 0; depth < segments.length; depth += 1) {
    const segment = segments[depth];
    const item = value.items.find((candidate) => candidate.itemId === segment.itemId);
    if (!item) {
      break;
    }
    labels.push(resolveItemLabel(item, config, segment.label));

    if (depth + 1 < segments.length) {
      const nextSegment = segments[depth + 1];
      const field = config.fields.find(
        (candidate): candidate is Extract<ListField, { kind: "list" }> =>
          candidate.kind === "list" && candidate.alias === nextSegment.fieldAlias
      );
      if (!field) {
        break;
      }
      config = field.list;
      value = normalizeListValue(item.values[field.alias]);
    }
  }

  return labels;
}

/**
 * Replaces one field's value on the item at the deepest segment, bubbling
 * the change back up through every ancestor item so the returned value is a
 * new root `ListValue` ready for the top-level `onChange`. Works for both a
 * scalar/question field's value and a nested list field's whole `ListValue`
 * (add/remove/reorder on a nested list is just "the field's value changed").
 */
export function setFieldValueAtScope(
  rootValue: ListValue,
  segments: readonly DrillSegment[],
  fieldAlias: string,
  fieldValue: unknown
): ListValue {
  if (segments.length === 0) {
    return rootValue;
  }
  return updateAtDepth(rootValue, segments, 0, fieldAlias, fieldValue);
}

function updateAtDepth(
  value: ListValue,
  segments: readonly DrillSegment[],
  depth: number,
  fieldAlias: string,
  fieldValue: unknown
): ListValue {
  const segment = segments[depth];
  return {
    items: value.items.map((item) => {
      if (item.itemId !== segment.itemId) {
        return item;
      }
      if (depth === segments.length - 1) {
        return { ...item, values: { ...item.values, [fieldAlias]: fieldValue } };
      }
      const nextSegment = segments[depth + 1];
      const nestedAlias = nextSegment.fieldAlias;
      if (nestedAlias === null) {
        return item;
      }
      const nestedValue = normalizeListValue(item.values[nestedAlias]);
      const updatedNested = updateAtDepth(nestedValue, segments, depth + 1, fieldAlias, fieldValue);
      return { ...item, values: { ...item.values, [nestedAlias]: updatedNested } };
    }),
  };
}

/**
 * Does the item at `index` — in a `validateListValue` result computed against
 * THIS SAME list's own value+config — have an error directly on it or
 * anywhere in its nested lists (LIST-9 AC3)? Paths follow validateListValue's
 * own convention: `[index]` (malformed item), `[index].field` (a field on
 * it), or `[index].field[nestedIndex]...` (inside one of its nested lists) —
 * a single prefix check at `[index]` therefore also catches every descendant
 * error. That is exactly the "ancestor rows badge too" requirement: a
 * shallower ListItemsView calls this against the SAME recursive
 * validateListValue result (computed from its own, shallower value+config,
 * which still recurses all the way down), so a deeply-nested error bubbles up
 * to every ancestor row with no extra propagation code.
 */
export function hasItemError(errors: ListValidationErrors, index: number): boolean {
  const itemPath = `[${index}]`;
  return Object.keys(errors).some((path) => path === itemPath || path.startsWith(`${itemPath}.`));
}

export interface ListErrorSummaryEntry {
  label: string;
  message: string;
}

/**
 * Turns `validateListValue`'s path-keyed errors into "<item label> — <message>"
 * lines using each item's CURRENT resolved label (LIST-9 AC6) — the page's
 * error summary can then name the offending row by what the respondent typed
 * ("Ben Chen — DOB is required"), not by a raw storage path
 * ("children[1].dob is required"). `fallbackLabel` (the list step's own
 * title) is used for an error with no item context, e.g. "At least 1 item is
 * required". `path` mirrors validateListValue's own accumulator and must
 * start at "" for the top-level call — every recursive call passes the exact
 * same path a nested list's own errors were keyed under.
 */
export function describeListErrorsForSummary(
  value: ListValue,
  config: ListConfig,
  errors: ListValidationErrors,
  fallbackLabel: string,
  path = ""
): ListErrorSummaryEntry[] {
  const entries: ListErrorSummaryEntry[] = [];
  const rootKey = path || "$root";
  for (const message of errors[rootKey] ?? []) {
    entries.push({ label: fallbackLabel, message });
  }

  value.items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    const itemLabel = resolveItemLabel(item, config, `Item ${index + 1}`);
    for (const message of errors[itemPath] ?? []) {
      entries.push({ label: itemLabel, message });
    }

    for (const field of config.fields) {
      const fieldPath = `${itemPath}.${field.alias}`;
      if (field.kind === "list") {
        const nestedValue = normalizeListValue(item.values[field.alias]);
        entries.push(...describeListErrorsForSummary(nestedValue, field.list, errors, itemLabel, fieldPath));
      } else {
        for (const message of errors[fieldPath] ?? []) {
          entries.push({ label: itemLabel, message });
        }
      }
    }
  });

  return entries;
}
