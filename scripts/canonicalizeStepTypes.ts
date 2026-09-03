import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";
import isEqual from "lodash/isEqual.js";
import { steps, workflowBlueprints, workflowVersions } from "../shared/schema/workflow";
import { adaptLegacyStep } from "../shared/types/stepConfigs";
import { validateCanonicalStepConfig } from "../shared/validation/stepConfigSchemas";
import { computeChecksum } from "../server/utils/checksum";

interface GraphCanonicalizationResult {
  graphJson: unknown;
  definitionsProcessed: number;
  definitionsChanged: number;
  oldToNewTypeCounts: Record<string, number>;
  removedKeysCounts: Record<string, number>;
  /** True when the graph carries no `pages` array this converter understands. */
  unrecognizedShape: boolean;
  /** Step-like definitions found in an unrecognized shape and therefore NOT converted. */
  unconvertedDefinitions: number;
}

function incrementCount(counts: Record<string, number>, key: string, amount = 1): void {
  counts[key] = (counts[key] ?? 0) + amount;
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, count] of Object.entries(source)) {
    incrementCount(target, key, count);
  }
}

export function canonicalizeStepDefinition(step: any) {
  const adapted = adaptLegacyStep({ type: step.type, config: step.config });
  
  const rawConfig = (typeof step.config === 'object' && step.config !== null) ? step.config : {};
  let currentConfig = structuredClone({ ...rawConfig, ...adapted.config });
  const removedKeys: string[] = [];

  // Synthesize required canonical defaults that were absent in legacy rows
  if (adapted.type === 'final_documents' && currentConfig) {
    if (currentConfig.markdownHeader === undefined) {
      currentConfig.markdownHeader = '';
    }
    if (currentConfig.documents === undefined) {
      currentConfig.documents = [];
    }
  } else if (adapted.type === 'address' && currentConfig) {
    // `AddressConfigSchema` admits exactly one value for each of these
    // (`country: z.literal('US')`, `fields: z.tuple([...])`), so supplying them
    // is forced, not a product choice. Decision 11 defers country *restrictions
    // and defaults* as an authoring capability; it does not make the single
    // legal discriminator optional. Without this, no legacy address row can
    // convert. (Reviewer, 2026-09-02.)
    if (currentConfig.country === undefined) {
      currentConfig.country = 'US';
    }
    if (currentConfig.fields === undefined) {
      currentConfig.fields = ['street', 'city', 'state', 'zip'];
    }
  }

  if (adapted.type === 'list' && currentConfig) {
    currentConfig = canonicalizeListConfig(currentConfig, removedKeys);
  }

  if (currentConfig !== undefined && currentConfig !== null) {
    let isValidated = false;
    while (!isValidated) {
      const result = validateCanonicalStepConfig(adapted.type, currentConfig);
      
      if (result.success) {
        currentConfig = result.data;
        isValidated = true;
        continue;
      }
      
      let madeChanges = false;
      if (!result.success && result.error) {
        for (const issue of result.error.issues) {
          if (issue.message.startsWith('Unknown config key')) {
            const path = issue.path;
            if (path.length > 0) {
              let target = currentConfig;
              for (let i = 0; i < path.length - 1; i++) {
                if (target[path[i]] !== undefined) {
                  target = target[path[i]];
                }
              }
              if (target && target[path[path.length - 1]] !== undefined) {
                delete target[path[path.length - 1]];
                removedKeys.push(path.join('.'));
                madeChanges = true;
              }
            }
          }
        }
      }
      
      if (!madeChanges && result.error) {
        throw new Error(`Invalid canonical config for ${adapted.type}: ${result.error.message}`);
      }
    }
  }

  return {
    canonicalType: adapted.type,
    canonicalConfig: currentConfig,
    removedKeys
  };
}

/**
 * Canonicalize the stored workflow graph shape emitted by
 * `VersionService.serializeWorkflowInTx`: `pages[].steps[]`.
 *
 * Three shapes exist and only one is written today:
 *  - `pages[].steps[]`  — what the serializer emits now; the one converted here.
 *  - top-level `blocks[]` — older artifacts predating the pages/steps split.
 *    Every such artifact on the dev branch carries an EMPTY `blocks` array, so
 *    there is nothing to convert; rather than guess at a shape that cannot be
 *    tested against real content, those are counted and reported.
 *  - `pages[].blocks[]` — what the unused `WorkflowGraphSchema` in
 *    `shared/zod-schemas.ts` declares. Nothing parses it and nothing stores it;
 *    do not reach for it here.
 */
export function canonicalizeGraphJson(graphJson: unknown): GraphCanonicalizationResult {
  if (typeof graphJson !== 'object' || graphJson === null || Array.isArray(graphJson)) {
    throw new Error('Artifact graphJson must be an object');
  }

  const clonedGraph = structuredClone(graphJson) as Record<string, unknown>;
  const stats: GraphCanonicalizationResult = {
    graphJson,
    definitionsProcessed: 0,
    definitionsChanged: 0,
    oldToNewTypeCounts: {},
    removedKeysCounts: {},
    unrecognizedShape: false,
    unconvertedDefinitions: 0,
  };

  if (!Array.isArray(clonedGraph.pages)) {
    // Artifacts written before the pages/steps serializer store definitions
    // under a top-level `blocks` array instead. This converter deliberately
    // does NOT rewrite a shape it cannot test against real content -- but a
    // shape it skipped must never be indistinguishable from a clean run, so
    // count what was left behind and let the caller surface and fail on it.
    // (Reviewer, 2026-09-02: every such artifact on the dev branch has an
    // empty `blocks` array, so this counts 0 there; other environments are
    // their own question, which is exactly why it is reported.)
    stats.unrecognizedShape = true;
    stats.unconvertedDefinitions = Array.isArray(clonedGraph.blocks)
      ? clonedGraph.blocks.filter(
        (block) => typeof block === 'object' && block !== null && 'type' in block,
      ).length
      : 0;
    return stats;
  }

  for (const page of clonedGraph.pages) {
    if (typeof page !== 'object' || page === null || Array.isArray(page)) {
      continue;
    }

    const pageRecord = page as Record<string, unknown>;
    if (!Array.isArray(pageRecord.steps)) {
      continue;
    }

    for (const step of pageRecord.steps) {
      if (typeof step !== 'object' || step === null || Array.isArray(step)) {
        throw new Error('Artifact graphJson pages[].steps[] entries must be objects');
      }

      const stepRecord = step as Record<string, unknown>;
      stats.definitionsProcessed++;
      const result = canonicalizeStepDefinition(stepRecord);
      const typeChanged = stepRecord.type !== result.canonicalType;
      const configChanged = !isEqual(stepRecord.config, result.canonicalConfig);

      if (typeChanged) {
        incrementCount(stats.oldToNewTypeCounts, `${String(stepRecord.type)} -> ${String(result.canonicalType)}`);
      }
      for (const key of result.removedKeys) {
        incrementCount(stats.removedKeysCounts, key);
      }

      if (typeChanged || configChanged) {
        stats.definitionsChanged++;
        stepRecord.type = result.canonicalType;
        stepRecord.config = result.canonicalConfig;
      }
    }
  }

  if (stats.definitionsChanged > 0) {
    stats.graphJson = clonedGraph;
  }
  return stats;
}

function canonicalizeListConfig(config: any, removedKeys: string[], parentPath: string = ''): any {
  if (!config.fields || !Array.isArray(config.fields)) { return config; }

  const newFields = config.fields.map((field: any) => {
    const fieldPrefix = parentPath ? `${parentPath}.${field.alias}` : field.alias;
    if (field.kind === 'question') {
      const adaptedField = adaptLegacyStep({ type: field.type, config: field.config });
      const rawFieldConfig = (typeof field.config === 'object' && field.config !== null) ? field.config : {};
      let currentFieldConfig = structuredClone({ ...rawFieldConfig, ...adaptedField.config });
      
      if (currentFieldConfig !== undefined && currentFieldConfig !== null) {
        let isValidated = false;
        while (!isValidated) {
          const result = validateCanonicalStepConfig(adaptedField.type, currentFieldConfig);
          if (result.success) {
            currentFieldConfig = result.data;
            isValidated = true;
            continue;
          }
          
          let madeChanges = false;
          if (!result.success && result.error) {
            for (const issue of result.error.issues) {
              if (issue.message.startsWith('Unknown config key')) {
                const path = issue.path;
                if (path.length > 0) {
                  let target = currentFieldConfig;
                  for (let i = 0; i < path.length - 1; i++) {
                    if (target[path[i]] !== undefined) {
                      target = target[path[i]];
                    }
                  }
                  if (target && target[path[path.length - 1]] !== undefined) {
                    delete target[path[path.length - 1]];
                    removedKeys.push(`${fieldPrefix}.config.${path.join('.')}`);
                    madeChanges = true;
                  }
                }
              }
            }
          }
          
          if (!madeChanges && result.error) {
            throw new Error(`Invalid canonical config in list field ${field.alias}: ${result.error.message}`);
          }
        }
      }

      return {
        ...field,
        type: adaptedField.type,
        config: currentFieldConfig
      };
    } else if (field.kind === 'list') {
      return {
        ...field,
        list: canonicalizeListConfig(field.list, removedKeys, parentPath ? `${parentPath}.${field.alias}.list` : `${field.alias}.list`)
      };
    }
    return field;
  });

  return { ...config, fields: newFields };
}

async function run() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isAudit = args.includes('--audit');

  let workflowIdScope: string | undefined;
  let dbUrl: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workflow-id' && args[i + 1] && !args[i + 1].startsWith('--')) {
      workflowIdScope = args[i + 1];
    }
    if (args[i] === '--database-url' && args[i + 1] && !args[i + 1].startsWith('--')) {
      dbUrl = args[i + 1];
    }
  }

  if (isApply) {
    if (!dbUrl) {
      console.error('ERROR: --apply requires an explicit --database-url argument.');
      process.exit(1);
    }
    process.env.DATABASE_URL = dbUrl;
  }

  const { db, initializeDatabase } = await import("../server/db");
  await initializeDatabase();

  console.log(`Starting canonicalization in ${isAudit ? 'AUDIT' : isApply ? 'APPLY' : 'DRY-RUN'} mode...`);
  if (workflowIdScope) {
    console.log(`Scoping to workflow ID: ${workflowIdScope}`);
  }

  const allSteps = workflowIdScope
    ? await db.select().from(steps).where(eq(steps.workflowId, workflowIdScope))
    : await db.select().from(steps);
  const allVersions = workflowIdScope
    ? await db.select().from(workflowVersions).where(eq(workflowVersions.workflowId, workflowIdScope))
    : await db.select().from(workflowVersions);
  const allBlueprints = workflowIdScope
    ? await db.select().from(workflowBlueprints).where(eq(workflowBlueprints.sourceWorkflowId, workflowIdScope))
    : await db.select().from(workflowBlueprints);

  console.log(`Found ${allSteps.length} total steps (live and soft-deleted).`);
  console.log(`Found ${allVersions.length} workflow-version artifacts.`);
  console.log(`Found ${allBlueprints.length} workflow-blueprint artifacts.`);

  const stats = {
    totalRows: allSteps.length,
    rowsChanged: 0,
    failures: 0,
    workflowsAffected: new Set<string>(),
    oldToNewTypeCounts: {} as Record<string, number>,
    removedKeysCounts: {} as Record<string, number>,
    versionArtifactsChanged: 0,
    versionDefinitionsProcessed: 0,
    versionDefinitionsChanged: 0,
    versionChecksumsRecomputed: 0,
    versionNullChecksumsPreserved: 0,
    versionChecksumsChanged: 0,
    blueprintArtifactsChanged: 0,
    blueprintDefinitionsProcessed: 0,
    blueprintDefinitionsChanged: 0,
    unrecognizedShapeArtifacts: 0,
    unconvertedDefinitions: 0,
  };

  const updates: Array<{ id: string, type: any, config: any }> = [];
  const versionUpdates: Array<{ id: string, graphJson: unknown, hadChecksum: boolean }> = [];
  const blueprintUpdates: Array<{ id: string, graphJson: unknown }> = [];

  for (const step of allSteps) {
    try {
      const result = canonicalizeStepDefinition(step);
      
      const typeChanged = step.type !== result.canonicalType;
      const configChanged = !isEqual(step.config, result.canonicalConfig);
      
      if (typeChanged || configChanged || result.removedKeys.length > 0) {
        if (typeChanged) {
          const mappingKey = `${step.type} -> ${result.canonicalType}`;
          incrementCount(stats.oldToNewTypeCounts, mappingKey);
        }
        
        if (result.removedKeys.length > 0) {
          for (const key of result.removedKeys) {
            incrementCount(stats.removedKeysCounts, key);
          }
        }
        
        if (typeChanged || configChanged) {
          stats.rowsChanged++;
          stats.workflowsAffected.add(step.workflowId);
          updates.push({
            id: step.id,
            type: result.canonicalType,
            config: result.canonicalConfig
          });
        }
      }
    } catch (err) {
      console.error(`Failed to canonicalize step ${step.id} (type: ${step.type}):`, err);
      stats.failures++;
    }
  }

  for (const version of allVersions) {
    try {
      const result = canonicalizeGraphJson(version.graphJson);
      stats.versionDefinitionsProcessed += result.definitionsProcessed;
      stats.versionDefinitionsChanged += result.definitionsChanged;
      stats.unrecognizedShapeArtifacts += result.unrecognizedShape ? 1 : 0;
      stats.unconvertedDefinitions += result.unconvertedDefinitions;
      mergeCounts(stats.oldToNewTypeCounts, result.oldToNewTypeCounts);
      mergeCounts(stats.removedKeysCounts, result.removedKeysCounts);

      if (result.definitionsChanged > 0) {
        stats.versionArtifactsChanged++;
        if (version.checksum === null) {
          stats.versionNullChecksumsPreserved++;
        } else {
          stats.versionChecksumsRecomputed++;
          stats.versionChecksumsChanged++;
        }
        versionUpdates.push({
          id: version.id,
          graphJson: result.graphJson,
          hadChecksum: version.checksum !== null,
        });
      }
    } catch (err) {
      console.error(`Failed to canonicalize workflow version ${version.id}:`, err);
      stats.failures++;
    }
  }

  for (const blueprint of allBlueprints) {
    try {
      const result = canonicalizeGraphJson(blueprint.graphJson);
      stats.blueprintDefinitionsProcessed += result.definitionsProcessed;
      stats.blueprintDefinitionsChanged += result.definitionsChanged;
      stats.unrecognizedShapeArtifacts += result.unrecognizedShape ? 1 : 0;
      stats.unconvertedDefinitions += result.unconvertedDefinitions;
      mergeCounts(stats.oldToNewTypeCounts, result.oldToNewTypeCounts);
      mergeCounts(stats.removedKeysCounts, result.removedKeysCounts);

      if (result.definitionsChanged > 0) {
        stats.blueprintArtifactsChanged++;
        blueprintUpdates.push({ id: blueprint.id, graphJson: result.graphJson });
      }
    } catch (err) {
      console.error(`Failed to canonicalize workflow blueprint ${blueprint.id}:`, err);
      stats.failures++;
    }
  }

  console.log('\n--- Canonicalization Report ---');
  console.log(`Total rows processed: ${stats.totalRows}`);
  console.log(`Rows changed:         ${stats.rowsChanged}`);
  console.log(`Workflows affected:   ${stats.workflowsAffected.size}`);
  console.log(`Version artifacts processed:       ${allVersions.length}`);
  console.log(`Version artifacts changed:         ${stats.versionArtifactsChanged}`);
  console.log(`Version step definitions processed: ${stats.versionDefinitionsProcessed}`);
  console.log(`Version step definitions converted: ${stats.versionDefinitionsChanged}`);
  console.log(`Version checksums recomputed:       ${stats.versionChecksumsRecomputed}`);
  console.log(`Version checksums changed:          ${stats.versionChecksumsChanged}`);
  console.log(`Version NULL checksums preserved:   ${stats.versionNullChecksumsPreserved}`);
  console.log(`Blueprint artifacts processed:       ${allBlueprints.length}`);
  console.log(`Blueprint artifacts changed:         ${stats.blueprintArtifactsChanged}`);
  console.log(`Blueprint step definitions processed: ${stats.blueprintDefinitionsProcessed}`);
  console.log(`Blueprint step definitions converted: ${stats.blueprintDefinitionsChanged}`);
  console.log(`Artifacts in an unrecognized graph shape: ${stats.unrecognizedShapeArtifacts}`);
  console.log(`Definitions left unconverted by shape:    ${stats.unconvertedDefinitions}`);
  console.log(`Failures:             ${stats.failures}`);
  
  if (Object.keys(stats.oldToNewTypeCounts).length > 0) {
    console.log('\nType Mappings:');
    for (const [mapping, count] of Object.entries(stats.oldToNewTypeCounts)) {
      console.log(`  ${mapping}: ${count}`);
    }
  }

  if (Object.keys(stats.removedKeysCounts).length > 0) {
    console.log('\nRemoved Keys:');
    for (const [key, count] of Object.entries(stats.removedKeysCounts)) {
      console.log(`  ${key}: ${count}`);
    }
  }
  console.log('-------------------------------\n');

  if (stats.failures > 0) {
    console.error('ERROR: Conversion failures detected during planning pass. Aborting without writes.');
    process.exit(1);
  }

  if (isAudit) {
    if (
      stats.rowsChanged > 0 ||
      stats.versionArtifactsChanged > 0 ||
      stats.blueprintArtifactsChanged > 0 ||
      stats.unconvertedDefinitions > 0 ||
      Object.keys(stats.removedKeysCounts).length > 0
    ) {
      console.error('ERROR: Audit failed. Legacy types or keys still exist.');
      process.exit(1);
    }
    console.log('Audit passed. Zero legacy definitions found.');
    process.exit(0);
  }

  const totalUpdates = updates.length + versionUpdates.length + blueprintUpdates.length;
  if (isApply && totalUpdates > 0) {
    console.log(`\nApplying ${totalUpdates} updates in a transaction...`);
    await db.transaction(async (tx: any) => {
      for (const update of updates) {
        await tx.update(steps)
          .set({ type: update.type, config: update.config })
          .where(eq(steps.id, update.id));
      }
      for (const update of versionUpdates) {
        await tx.update(workflowVersions)
          .set({ graphJson: update.graphJson })
          .where(eq(workflowVersions.id, update.id));
        if (update.hadChecksum) {
          // Hash what Postgres actually stored, not the in-memory object.
          // jsonb normalizes key order (length, then bytewise) and
          // `computeChecksum` is a plain `JSON.stringify`, so reading back is
          // what guarantees the checksum describes the stored bytes.
          const [storedVersion] = await tx
            .select({ graphJson: workflowVersions.graphJson })
            .from(workflowVersions)
            .where(eq(workflowVersions.id, update.id));
          if (storedVersion === undefined) {
            throw new Error(`Workflow version ${update.id} disappeared during canonicalization`);
          }
          await tx.update(workflowVersions)
            .set({ checksum: computeChecksum({ graphJson: storedVersion.graphJson }) })
            .where(eq(workflowVersions.id, update.id));
        }
      }
      for (const update of blueprintUpdates) {
        await tx.update(workflowBlueprints)
          .set({ graphJson: update.graphJson })
          .where(eq(workflowBlueprints.id, update.id));
      }
    });
    console.log('Transaction committed successfully.');
  }
  
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
