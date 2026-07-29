/**
 * Rewrite any string in a JSON value that matches a key in `idMap` to its
 * mapped id, recursively.
 *
 * This is the ONE implementation for every path that copies jsonb carrying
 * embedded ids — `WorkflowClonerService` (clone a whole asset),
 * `ImportService` (clone-mode import), and `SectionService` (duplicate a
 * section). All three run it over the same column, `logic_rules.conditionValue`,
 * which is why it must not be forked again: three copies of one walker would
 * drift, and a fix to one would silently miss the others (DEBT-12).
 *
 * Known limitation: only string *values* are remapped, never object *keys*. A
 * config shaped `{ "<stepId>": {...} }` passes through untouched. Nothing in
 * the current schema relies on id-keyed jsonb, but if that changes, fix it
 * here — and it will then be fixed for all three callers at once, which is the
 * point of this module.
 */
export function remapJsonIds<T>(value: T, idMap: Map<string, string>): T {
  if (typeof value === "string") {
    return (idMap.get(value) ?? value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => remapJsonIds(item, idMap)) as T;
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    const remapped: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      remapped[key] = remapJsonIds(nestedValue, idMap);
    }
    return remapped as T;
  }

  return value;
}
