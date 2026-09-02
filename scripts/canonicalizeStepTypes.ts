import { fileURLToPath } from "url";
import isEqual from "lodash/isEqual.js";
import { steps } from "../shared/schema/workflow";
import { adaptLegacyStep } from "../shared/types/stepConfigs";
import { validateCanonicalStepConfig } from "../shared/validation/stepConfigSchemas";

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

  let allStepsQuery = db.select().from(steps);
  if (workflowIdScope) {
    const { eq } = await import('drizzle-orm');
    allStepsQuery = allStepsQuery.where(eq(steps.workflowId, workflowIdScope)) as any;
  }
  const allSteps = await allStepsQuery;

  console.log(`Found ${allSteps.length} total steps (live and soft-deleted).`);

  const stats = {
    totalRows: allSteps.length,
    rowsChanged: 0,
    failures: 0,
    workflowsAffected: new Set<string>(),
    oldToNewTypeCounts: {} as Record<string, number>,
    removedKeysCounts: {} as Record<string, number>,
  };

  const updates: Array<{ id: string, type: any, config: any }> = [];

  for (const step of allSteps) {
    try {
      const result = canonicalizeStepDefinition(step);
      
      const typeChanged = step.type !== result.canonicalType;
      const configChanged = !isEqual(step.config, result.canonicalConfig);
      
      if (typeChanged || configChanged || result.removedKeys.length > 0) {
        if (typeChanged) {
          const mappingKey = `${step.type} -> ${result.canonicalType}`;
          stats.oldToNewTypeCounts[mappingKey] = (stats.oldToNewTypeCounts[mappingKey] || 0) + 1;
        }
        
        if (result.removedKeys.length > 0) {
          for (const key of result.removedKeys) {
            stats.removedKeysCounts[key] = (stats.removedKeysCounts[key] || 0) + 1;
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

  console.log('\n--- Canonicalization Report ---');
  console.log(`Total rows processed: ${stats.totalRows}`);
  console.log(`Rows changed:         ${stats.rowsChanged}`);
  console.log(`Workflows affected:   ${stats.workflowsAffected.size}`);
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
    if (stats.rowsChanged > 0 || Object.keys(stats.removedKeysCounts).length > 0) {
      console.error('ERROR: Audit failed. Legacy types or keys still exist.');
      process.exit(1);
    }
    console.log('Audit passed. Zero legacy definitions found.');
    process.exit(0);
  }

  if (isApply && updates.length > 0) {
    console.log(`\nApplying ${updates.length} updates in a transaction...`);
    const { db } = await import("../server/db");
    await db.transaction(async (tx: any) => {
      for (const update of updates) {
        const { eq } = await import('drizzle-orm');
        await tx.update(steps)
          .set({ type: update.type, config: update.config })
          .where(eq(steps.id, update.id));
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
