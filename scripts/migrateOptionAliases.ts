import { db, initializeDatabase } from "../server/db";
import { stepService } from "../server/services/StepService";
import { stepRepository } from "../server/repositories";
import { sql } from "drizzle-orm";
import type { ChoiceOption } from "@shared/types/stepConfigs";

async function run(isApply: boolean = false) {
  console.log(`Starting option alias migration... (Dry run: ${!isApply})`);
  await initializeDatabase();

  const allStepsResult = await db.execute(sql`
    SELECT "id", "workflow_id" as "workflowId", "type", "config" 
    FROM "steps" 
    WHERE "type" = 'choice'
  `);
  
  const steps = allStepsResult.rows as any[];
  console.log(`Found ${steps.length} choice steps.`);

  let migratedSteps = 0;
  let skippedOptions = 0;
  const totalWarnings: string[] = [];

  for (const step of steps) {
    if (!step.config) {continue;}
    let config = step.config;
    if (typeof config === 'string') {
      try {
        config = JSON.parse(config);
      } catch (e) {
        continue;
      }
    }

    let optionsArray: ChoiceOption[] | null = null;
    let isStaticType = false;

    if (Array.isArray(config?.options)) {
      optionsArray = config.options;
    } else if (config?.options?.type === 'static' && Array.isArray(config.options.options)) {
      optionsArray = config.options.options;
      isStaticType = true;
    }

    if (!optionsArray) {continue;}

    const newOptionsArray = JSON.parse(JSON.stringify(optionsArray)) as ChoiceOption[];
    const aliasChanges = new Map<string, string>();
    let hasChanges = false;
    for (const opt of newOptionsArray) {
      const alias = opt.alias ?? opt.id;
      const label = opt.label;

      if (label && alias !== label) {
        // Two options sharing a label would migrate to the same saved value,
        // which the builder's duplicate-alias guard rejects. Skip and report
        // rather than guessing at a suffix -- that is a human decision.
        const optionsWithSameLabel = newOptionsArray.filter(o => o.label === label);
        if (optionsWithSameLabel.length > 1) {
          console.log(`[SKIP] Step ${step.id}: Option label "${label}" is duplicated in this step. Skipping alias rewrite.`);
          skippedOptions++;
          continue;
        }

        console.log(`[CHANGE] Step ${step.id}: Option alias "${alias}" -> "${label}"`);
        opt.alias = label;
        aliasChanges.set(alias, label);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      migratedSteps++;
      if (isApply) {
        // update config object
        if (isStaticType) {
          config.options.options = newOptionsArray;
        } else {
          config.options = newOptionsArray;
        }

        await db.transaction(async (tx: any) => {
          await stepRepository.update(step.id, { config }, tx);
          const warnings = await stepService.propagateChoiceOptionRenames(step.id, step.workflowId, aliasChanges, tx);
          totalWarnings.push(...warnings);
        });
      }
    }
  }

  console.log(`\nMigration summary:`);
  console.log(`- Steps to migrate: ${migratedSteps}`);
  console.log(`- Skipped options (duplicate labels): ${skippedOptions}`);
  if (totalWarnings.length > 0) {
    console.log(`- Warnings:`);
    totalWarnings.forEach(w => console.log(`  * ${w}`));
  }

  if (!isApply) {
    console.log(`\nRun with --apply to commit changes.`);
  } else {
    console.log(`\nMigration completed successfully.`);
  }

  return { migratedSteps, skippedOptions, totalWarnings };
}

if (require.main === module || process.argv[1]?.endsWith("migrateOptionAliases.ts")) {
  run(process.argv.includes("--apply")).then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { run };
