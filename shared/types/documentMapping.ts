/**
 * Document field mapping — the binding types the Document Mapping Workbench
 * (GH-156) reads, writes, and validates.
 *
 * A mapping binds ONE document placeholder/field name to a value source. Four
 * kinds are supported:
 * - `variable`  — a workflow step alias (or a dotted path into a flattened
 *                 nested value, e.g. `address.city`). The original, still most
 *                 common shape; unchanged from what `FinalBlockConfig` and
 *                 `SignatureBlockConfig` already stored before GH-156.
 * - `constant`  — a fixed string, always resolves, never warns.
 * - `formula`   — a template string containing `{{alias}}` tokens, resolved by
 *                 substitution against normalized run data (no expression
 *                 language, no eval — see `evaluateFormulaExpression`).
 * - `datavault` — a specific column of a specific DataVault row, resolved at
 *                 generation time via `DatavaultRowsService.getRow`.
 *
 * This module is intentionally dependency-free (no drizzle, no express) so it
 * can be imported from both `server/` and `client/`.
 */
import { z } from "zod";

export interface VariableMappingBinding {
  type: "variable";
  /** Step alias, or a dotted path into flattened run data (e.g. "address.city"). */
  source: string;
}

export interface ConstantMappingBinding {
  type: "constant";
  value: string;
}

export interface FormulaMappingBinding {
  type: "formula";
  /** Template string with `{{alias}}` tokens, e.g. "{{firstName}} {{lastName}}". */
  expression: string;
}

export interface DatavaultMappingBinding {
  type: "datavault";
  tableId: string;
  columnId: string;
  rowId: string;
}

export type MappingBinding =
  | VariableMappingBinding
  | ConstantMappingBinding
  | FormulaMappingBinding
  | DatavaultMappingBinding;

/** A full field mapping: target document field name -> binding. */
export type DocumentFieldMapping = Record<string, MappingBinding>;

export const mappingBindingSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("variable"), source: z.string().min(1) }),
  z.object({ type: z.literal("constant"), value: z.string() }),
  z.object({ type: z.literal("formula"), expression: z.string().min(1) }),
  z.object({
    type: z.literal("datavault"),
    tableId: z.string().uuid(),
    columnId: z.string().uuid(),
    rowId: z.string().uuid(),
  }),
]);

export const documentFieldMappingSchema = z.record(z.string(), mappingBindingSchema);

/** `{{alias}}` / `{{a.b}}` tokens inside a formula expression. */
const FORMULA_TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Extract the referenced aliases/paths out of a formula expression, in order, deduped. */
export function extractFormulaReferences(expression: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const match of expression.matchAll(FORMULA_TOKEN_PATTERN)) {
    // The capture group is not optional, but this module is inside a strict
    // zone with noUncheckedIndexedAccess, so narrow rather than assert.
    const ref = match[1];
    if (ref !== undefined && !seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }
  return refs;
}

/**
 * Type guard for a raw (untyped, jsonb-derived) value that looks like a
 * `MappingBinding`. Used by code (like the publish-gate lint rules) that reads
 * serialized workflow content as `Record<string, any>` rather than the typed
 * shape.
 */
export function isMappingBindingLike(value: unknown): value is { type: string; [key: string]: unknown } {
  return value !== null && typeof value === "object" && "type" in value && typeof (value as { type: unknown }).type === "string";
}
