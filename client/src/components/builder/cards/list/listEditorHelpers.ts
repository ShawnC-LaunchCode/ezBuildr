/**
 * Pure helpers for the recursive List editor (LIST-6). No React, no hooks —
 * kept testable in isolation and shared between ListLevelEditor and
 * ListFieldRow.
 */
import { arrayMove } from "@dnd-kit/sortable";

import { BLOCK_REGISTRY, type BlockCategory } from "@/lib/blockRegistry";

import {
  LIST_FIELD_QUESTION_TYPES,
  type ListConfig,
  type ListField,
  type ListFieldQuestionType,
} from "@shared/types/stepConfigs";

const registryEntryByType = new Map(BLOCK_REGISTRY.map((entry) => [entry.type, entry]));

/** Sentinel value for the "Nested List" entry in the type palette (not a real ListFieldQuestionType). */
export const NESTED_LIST_TYPE_VALUE = "__nested_list__";

/** One entry in the "Add Question" / "change type" palette (LIST2-1). */
export interface ListFieldPaletteEntry {
  value: ListFieldQuestionType | typeof NESTED_LIST_TYPE_VALUE;
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
  const questionEntries: ListFieldPaletteEntry[] = LIST_FIELD_QUESTION_TYPES.map((type) => {
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

  return [...questionEntries, nestedEntry];
}

/** Palette entries grouped by BLOCK_REGISTRY category, for the two-column layout. */
export function getListFieldPaletteByCategory(): Partial<Record<BlockCategory, ListFieldPaletteEntry[]>> {
  const grouped: Partial<Record<BlockCategory, ListFieldPaletteEntry[]>> = {};
  for (const entry of getListFieldPaletteEntries()) {
    (grouped[entry.category] ??= []).push(entry);
  }
  return grouped;
}

export function validateFieldAliasFormat(alias: string): string | null {
  const trimmed = alias.trim();
  if (!trimmed) {
    return "Alias is required";
  }
  if (!/^[a-zA-Z_]/.test(trimmed)) {
    return "Must start with a letter or underscore";
  }
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return "Can only contain letters, numbers, and underscores";
  }
  return null;
}

/**
 * Aliases duplicated within one level's field list (case/whitespace
 * insensitive). Deliberately scoped to a single `fields` array — a sibling
 * level's aliases must never factor in, since the same alias is allowed at
 * two different levels (LIST-6 AC5).
 */
export function findDuplicateFieldAliases(fields: readonly ListField[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const field of fields) {
    const key = field.alias.trim().toLowerCase();
    if (!key) {
      continue;
    }
    if (seen.has(key)) {
      duplicates.add(key);
    } else {
      seen.add(key);
    }
  }
  return duplicates;
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
  type: ListFieldQuestionType = "short_text"
): ListField {
  return {
    kind: "question",
    id: generateFieldId(),
    alias: nextFieldAlias(fields, "field"),
    type,
    title: `Field ${fields.length + 1}`,
    order: fields.length,
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
  target: ListFieldQuestionType | typeof NESTED_LIST_TYPE_VALUE
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
  if (field.kind === "question") {
    return { ...field, type: target };
  }
  return {
    kind: "question",
    id: field.id,
    alias: field.alias,
    title: field.title,
    description: field.description,
    order: field.order,
    type: target,
  };
}
