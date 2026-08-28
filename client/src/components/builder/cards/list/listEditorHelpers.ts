/**
 * Pure helpers for the recursive List editor (LIST-6). No React, no hooks —
 * kept testable in isolation and shared between ListLevelEditor and
 * ListFieldRow.
 */
import { arrayMove } from "@dnd-kit/sortable";

import { BLOCK_REGISTRY, QUESTION_PRESETS, type BlockCategory } from "@/lib/blockRegistry";

import {
  LIST_FIELD_QUESTION_TYPES,
  resolveTextConfig,
  type ListConfig,
  type ListField,
  type ListFieldQuestionType,
} from "@shared/types/stepConfigs";
import {
  findDuplicateFieldAliases,
  validateFieldAliasFormat,
} from "@shared/validation/listFieldHelpers";

// Moved into shared/ (LIST2-3) so the server-side list config schema can
// reuse the exact same alias rule instead of a second, drifting regex.
export { findDuplicateFieldAliases, validateFieldAliasFormat };

const registryEntryByType = new Map(BLOCK_REGISTRY.map((entry) => [entry.type, entry]));

/** Sentinel value for the "Nested List" entry in the type palette (not a real ListFieldQuestionType). */
export const NESTED_LIST_TYPE_VALUE = "__nested_list__";
export const SHORT_TEXT_FIELD_PRESET = "easy.short-text";
export const LONG_TEXT_FIELD_PRESET = "easy.long-text";

export type ListFieldTypeSelection =
  | ListFieldQuestionType
  | typeof NESTED_LIST_TYPE_VALUE
  | typeof SHORT_TEXT_FIELD_PRESET
  | typeof LONG_TEXT_FIELD_PRESET;

type AuthorableListFieldQuestionType = Exclude<
  ListFieldQuestionType,
  "short_text" | "long_text"
>;

/** One entry in the "Add Question" / "change type" palette (LIST2-1). */
export interface ListFieldPaletteEntry {
  value: ListFieldTypeSelection;
  /** BLOCK_REGISTRY type used only to resolve an icon/color tile — see QuestionTypeIcon. */
  iconType: string;
  label: string;
  description?: string;
  category: BlockCategory;
}

const nestedListRegistryEntry = registryEntryByType.get("list");

/**
 * Every field type the list-field palette may offer: the runner-renderable
 * question types (LIST_FIELD_QUESTION_TYPES) plus one synthetic "Nested
 * List" entry. Deliberately independent of the parent workflow's
 * easy/advanced mode — a list field's type universe is fixed regardless of
 * it (unlike QuestionAddMenu, which mode-filters BLOCK_REGISTRY).
 */
export function getListFieldPaletteEntries(): ListFieldPaletteEntry[] {
  const textEntries: ListFieldPaletteEntry[] = QUESTION_PRESETS
    .filter((preset) => preset.canonicalType === "text")
    .map((preset) => ({
      value: preset.id === LONG_TEXT_FIELD_PRESET ? LONG_TEXT_FIELD_PRESET : SHORT_TEXT_FIELD_PRESET,
      iconType: "text",
      label: preset.label,
      category: "text",
    }));
  const questionEntries: ListFieldPaletteEntry[] = LIST_FIELD_QUESTION_TYPES
    .filter((type) => type !== "text")
    .map((type) => {
    const entry = registryEntryByType.get(type);
    return {
      value: type,
      iconType: type,
      label: entry?.label ?? type,
      description: entry?.description,
      category: entry?.category ?? "display",
    };
  });

  const nestedEntry: ListFieldPaletteEntry = {
    value: NESTED_LIST_TYPE_VALUE,
    iconType: "list",
    label: "Nested List",
    description: nestedListRegistryEntry?.description,
    category: nestedListRegistryEntry?.category ?? "structure",
  };

  return [...textEntries, ...questionEntries, nestedEntry];
}

/** Palette entries grouped by BLOCK_REGISTRY category, for the two-column layout. */
export function getListFieldPaletteByCategory(): Partial<Record<BlockCategory, ListFieldPaletteEntry[]>> {
  const grouped: Partial<Record<BlockCategory, ListFieldPaletteEntry[]>> = {};
  for (const entry of getListFieldPaletteEntries()) {
    (grouped[entry.category] ??= []).push(entry);
  }
  return grouped;
}

export function isDuplicateFieldAlias(alias: string, duplicates: Set<string>): boolean {
  return duplicates.has(alias.trim().toLowerCase());
}

function usedAliases(fields: readonly ListField[]): Set<string> {
  return new Set(fields.map((field) => field.alias.trim().toLowerCase()));
}

function nextFieldAlias(fields: readonly ListField[], base: string): string {
  const used = usedAliases(fields);
  let n = fields.length + 1;
  while (used.has(`${base}_${n}`)) {
    n += 1;
  }
  return `${base}_${n}`;
}

export function generateFieldId(): string {
  return crypto.randomUUID();
}

export function createQuestionField(
  fields: readonly ListField[],
  selection: Exclude<ListFieldTypeSelection, typeof NESTED_LIST_TYPE_VALUE> = SHORT_TEXT_FIELD_PRESET
): ListField {
  const { type, config } = resolveQuestionSelection(selection);
  return {
    kind: "question",
    id: generateFieldId(),
    alias: nextFieldAlias(fields, "field"),
    type,
    title: `Field ${fields.length + 1}`,
    order: fields.length,
    ...(config ? { config } : {}),
  };
}

export function createNestedListField(fields: readonly ListField[]): ListField {
  return {
    kind: "list",
    id: generateFieldId(),
    alias: nextFieldAlias(fields, "list"),
    title: `List ${fields.length + 1}`,
    order: fields.length,
    list: { fields: [createQuestionField([])] },
  };
}

/** Reassigns `order` sequentially after a drag-and-drop move — mirrors client/src/lib/dnd.ts's recomputeOrders. */
export function reorderFields(fields: readonly ListField[], oldIndex: number, newIndex: number): ListField[] {
  return arrayMove([...fields], oldIndex, newIndex).map((field, index) => ({ ...field, order: index }));
}

export function removeField(fields: readonly ListField[], fieldId: string): ListField[] {
  return fields.filter((field) => field.id !== fieldId).map((field, index) => ({ ...field, order: index }));
}

export function replaceField(fields: readonly ListField[], fieldId: string, next: ListField): ListField[] {
  return fields.map((field) => (field.id === fieldId ? next : field));
}

export function appendField(config: ListConfig, field: ListField): ListConfig {
  return { ...config, fields: [...config.fields, field] };
}

/**
 * Applies a "Type" select change to a field. Switching into the sentinel
 * `NESTED_LIST_TYPE_VALUE` converts the field to `kind: "list"` with a fresh
 * one-field nested config; switching out of it (or between question types)
 * converts/updates `kind: "question"`. `id`/`alias`/`title`/`order` always
 * carry over — only the type-specific parts change.
 */
export function changeFieldType(
  field: ListField,
  target: ListFieldTypeSelection
): ListField {
  if (target === NESTED_LIST_TYPE_VALUE) {
    if (field.kind === "list") {
      return field;
    }
    return {
      kind: "list",
      id: field.id,
      alias: field.alias,
      title: field.title,
      description: field.description,
      order: field.order,
      list: { fields: [createQuestionField([])] },
    };
  }
  const selection = resolveQuestionSelection(target);
  const nextConfig = selection.type === "text"
    ? resolveTextTransitionConfig(field, selection.config?.variant ?? "short")
    : undefined;
  if (field.kind === "question") {
    return {
      ...field,
      type: selection.type,
      ...(nextConfig ? { config: nextConfig } : {}),
    };
  }
  return {
    kind: "question",
    id: field.id,
    alias: field.alias,
    title: field.title,
    description: field.description,
    order: field.order,
    type: selection.type,
    ...(nextConfig ? { config: nextConfig } : {}),
  };
}

function resolveQuestionSelection(
  selection: Exclude<ListFieldTypeSelection, typeof NESTED_LIST_TYPE_VALUE>
): { type: AuthorableListFieldQuestionType; config?: { variant: "short" | "long" } } {
  if (
    selection === SHORT_TEXT_FIELD_PRESET
    || selection === "short_text"
    || selection === "text"
  ) {
    return { type: "text", config: { variant: "short" } };
  }
  if (selection === LONG_TEXT_FIELD_PRESET || selection === "long_text") {
    return { type: "text", config: { variant: "long" } };
  }
  return { type: selection };
}

function resolveTextTransitionConfig(
  field: ListField,
  variant: "short" | "long"
): ReturnType<typeof resolveTextConfig> {
  if (field.kind !== "question" || !["text", "short_text", "long_text"].includes(field.type)) {
    return { variant };
  }
  return { ...resolveTextConfig(field.type, field.config), variant };
}
