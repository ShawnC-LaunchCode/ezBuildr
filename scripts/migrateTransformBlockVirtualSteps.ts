/**
 * Data Migration: Create Virtual Steps for Existing Transform Blocks
 *
 * This script creates virtual steps for all existing transform blocks that don't have one.
 * Virtual steps allow transform blocks to persist their output values as proper step values.
 *
 * Run this after applying the schema migration 0008_add_virtual_steps_for_transform_blocks.sql
 *
 * Usage:
 *   tsx scripts/migrateTransformBlockVirtualSteps.ts
 */

import { eq, isNull, _and } from "drizzle-orm";

import { transformBlocks, steps, sections } from "@shared/schema";

import { db } from "../server/db";
import { createLogger } from "../server/logger";

const logger = createLogger({ module: "migrate-transform-blocks" });

async function migrateTransformBlocks() {
  logger.info("Starting transform block virtual steps migration...");

  try {
    // Find all transform blocks that don't have a virtual step
    const blocksWithoutVirtualSteps = await db
      .select()
      .from(transformBlocks)
      .where(isNull(transformBlocks.virtualStepId));

    if (blocksWithoutVirtualSteps.length === 0) {
      logger.info("No transform blocks need migration. All blocks already have virtual steps.");
      return { migrated: 0, skipped: 0 };
    }

    logger.info(
      { count: blocksWithoutVirtualSteps.length },
      "Found transform blocks without virtual steps"
    );

    let migratedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ blockId: string; error: string }> = [];

    for (const block of blocksWithoutVirtualSteps) {
      try {
        // Determine which section to attach the virtual step to
        let targetSectionId = block.sectionId;

        if (!targetSectionId) {
          // For workflow-scoped blocks, attach to the first section
          const workflowSections = await db
            .select()
            .from(sections)
            .where(eq(sections.workflowId, block.workflowId))
            .limit(1);

          if (workflowSections.length === 0) {
            logger.warn(
              { blockId: block.id, workflowId: block.workflowId },
              "Skipping block: workflow has no sections"
            );
            skippedCount++;
            continue;
          }

          targetSectionId = workflowSections[0].id;
        }

        // Create the virtual step
        const [virtualStep] = await db
          .insert(steps)
          .values({
            sectionId: targetSectionId,
            type: "computed",
            title: `Computed: ${block.name}`,
            description: `Virtual step for transform block: ${block.name}`,
            alias: block.outputKey,
            required: false,
            order: -1, // Negative order ensures it's sorted before user-visible steps
            isVirtual: true,
          })
          .returning();

        // Update the transform block with the virtual step ID
        await db
          .update(transformBlocks)
          .set({ virtualStepId: virtualStep.id })
          .where(eq(transformBlocks.id, block.id));

        logger.info(
          {
            blockId: block.id,
            blockName: block.name,
            virtualStepId: virtualStep.id,
            outputKey: block.outputKey,
          },
          "Created virtual step for transform block"
        );

        migratedCount++;
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(
          { blockId: block.id, blockName: block.name, error },
          "Failed to migrate transform block"
        );
        errors.push({ blockId: block.id, error: errorMsg });
        skippedCount++;
      }
    }

    logger.info(
      {
        total: blocksWithoutVirtualSteps.length,
        migrated: migratedCount,
        skipped: skippedCount,
        errors: errors.length,
      },
      "Migration complete"
    );

    if (errors.length > 0) {
      logger.error({ errors }, "Some blocks failed to migrate");
    }

    return {
      migrated: migratedCount,
      skipped: skippedCount,
      errors,
    };
  } catch (error: unknown) {
    logger.error({ error }, "Migration failed");
    throw error;
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  migrateTransformBlocks()
    .then((result) => {
      console.log("\n=================================");
      console.log("Migration Results:");
      console.log(`  Migrated: ${result.migrated}`);
      console.log(`  Skipped:  ${result.skipped}`);
      console.log(`  Errors:   ${result.errors.length}`);
      console.log("=================================\n");

      if (result.errors.length > 0) {
        console.error("Errors:");
        result.errors.forEach((err) => {
          console.error(`  Block ${err.blockId}: ${err.error}`);
        });
        process.exit(1);
      }

      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error("Migration failed:", error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}

export { migrateTransformBlocks };
