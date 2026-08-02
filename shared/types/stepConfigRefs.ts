/**
 * Entity references embedded inside a step's or block's jsonb `config`.
 *
 * Column-level foreign keys are declared in ENTITY_GRAPH and validated on
 * import. Ids buried in `config` are not: they are remapped best-effort by
 * `remapJsonIds` and an unmapped one passes through silently. That is how a
 * choice question bound to a DataVault table — including one nested inside a
 * List — could import with `201` and zero warnings while still pointing at the
 * *source* instance's table (IEX3-2).
 *
 * ## Why key names, not config shapes
 *
 * The obvious implementation walks the `StepConfig` union shape by shape. It
 * was rejected: there are a dozen config unions across `stepConfigs.ts` and
 * `blocks.ts` that carry references (`ChoiceAdvancedConfig.dynamicOptions`,
 * `FinalBlockConfig.documents[]`, `ReadTableConfig`, `WriteBlockConfig`,
 * `ComputedStepConfig`, ...), a shape walker has to enumerate every one, and
 * the next config type added silently escapes it — the same staleness that
 * retired the hand-maintained `RepeaterFieldType` (LIST-13).
 *
 * These configs already name references consistently, so the allowlist below
 * is the durable rule. Recursing over the whole object also means
 * `ListConfig.fields[]` — and a nested `kind: "list"` field's own fields, to
 * any depth — is covered without a special case, as are `filters[]`,
 * `columnMappings[]` and every other array.
 *
 * The allowlist is what keeps this precise: locally-scoped ids are keyed `id`
 * (`ChoiceOption.id`, `ListField.id`, `documents[].id`), which is deliberately
 * **not** a reference key. A UUID-shaped `id` must never be reported, or the
 * warning becomes noise and people learn to ignore it.
 */

/** Portable entity a config reference can point at. */
export type ConfigRefEntity =
  | 'datavault_databases'
  | 'datavault_tables'
  | 'datavault_columns'
  | 'templates'
  | 'transform_blocks'
  | 'blocks';

/**
 * Config keys that hold an id of another exported entity.
 *
 * Adding a config field that references an entity means adding it here, or the
 * import will not notice when that reference fails to travel.
 */
const REF_KEY_TO_ENTITY: Readonly<Record<string, ConfigRefEntity>> = {
  // DataVault bindings — choice dynamic options, Read Table, Write blocks
  dataSourceId: 'datavault_databases',
  databaseId: 'datavault_databases',
  tableId: 'datavault_tables',
  referenceTableId: 'datavault_tables',
  columnId: 'datavault_columns',
  labelColumnId: 'datavault_columns',
  valueColumnId: 'datavault_columns',
  primaryKeyColumnId: 'datavault_columns',
  // Document templates — final_documents and signature_block entries
  documentId: 'templates',
  templateId: 'templates',
  // Computed steps and inline-created List Tools blocks
  transformBlockId: 'transform_blocks',
  linkedListToolsBlockId: 'blocks',
};

export interface ConfigEntityRef {
  /** Dotted path from the config root, e.g. `config.fields[1].config.dynamicOptions.tableId`. */
  path: string;
  id: string;
  entity: ConfigRefEntity;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Every entity reference inside a config value, at any depth.
 *
 * Pure and dependency-free — it is called from the server importer and is safe
 * to call from the client. Order is stable (depth-first, key order) so callers
 * can assert on it.
 */
export function collectConfigEntityRefs(config: unknown, basePath = 'config'): ConfigEntityRef[] {
  const refs: ConfigEntityRef[] = [];
  walk(config, basePath, refs);
  return refs;
}

function walk(node: unknown, path: string, refs: ConfigEntityRef[]): void {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      walk(item, `${path}[${index}]`, refs);
    }
    return;
  }
  if (!isPlainObject(node)) {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    const childPath = `${path}.${key}`;
    const entity = REF_KEY_TO_ENTITY[key];
    if (entity !== undefined && typeof value === 'string' && value !== '') {
      refs.push({ path: childPath, id: value, entity });
      continue;
    }
    walk(value, childPath, refs);
  }
}
