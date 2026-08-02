/**
 * Pure alias helpers for a List field (LIST-6/LIST2-3). Shared between the
 * builder's authoring UI
 * (client/src/components/builder/cards/list/listEditorHelpers.ts, which
 * re-exports these two) and this module's sibling `stepConfigSchemas.ts`, so
 * the server-side config schema enforces the exact same alias rule the
 * builder does instead of a second, drifting copy of the regex.
 */
import type { ListField } from "../types/stepConfigs";

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
