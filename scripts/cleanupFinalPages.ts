/**
 * Cleanup Script: Remove orphaned questions from Final Documents pages
 *
 * Purpose: Delete any non-system steps (questions) that exist in Final Documents pages.
 * Final Documents pages should only contain a single system step of type 'final_documents'.
 *
 * This script:
 * 1. Finds all pages with config.finalBlock = true
 * 2. Identifies steps in those pages that are NOT type 'final_documents'
 * 3. Deletes those orphaned steps
 *
 * Usage: npx tsx scripts/cleanupFinalPages.ts
 */

import { eq, sql } from 'drizzle-orm';

import { db } from '../server/db';
import { pages, steps } from '../shared/schema';

async function cleanupFinalPages() {
  console.log('🧹 Starting cleanup of Final Documents pages...\n');

  try {
    // Step 1: Find all Final Documents pages
    const finalPages = await db
      .select({
        id: pages.id,
        title: pages.title,
        workflowId: pages.workflowId,
      })
      .from(pages)
      .where(sql`${pages.config}->>'finalBlock' = 'true'`);

    console.log(`Found ${finalPages.length} Final Documents page(s):\n`);
    finalPages.forEach((page, idx) => {
      console.log(`  ${idx + 1}. "${page.title}" (${page.id})`);
    });
    console.log();

    if (finalPages.length === 0) {
      console.log('✅ No Final Documents pages found. Nothing to clean up.');
      return;
    }

    // Step 2: Find orphaned steps (non-system steps in final pages)
    let totalOrphanedSteps = 0;

    for (const page of finalPages) {
      const orphanedSteps = await db
        .select({
          id: steps.id,
          title: steps.title,
          type: steps.type,
        })
        .from(steps)
        .where(
          sql`${steps.pageId} = ${page.id} AND ${steps.type} != 'final_documents'`
        );

      if (orphanedSteps.length > 0) {
        console.log(`📋 Page "${page.title}" has ${orphanedSteps.length} orphaned step(s):`);
        orphanedSteps.forEach((step, idx) => {
          console.log(`    ${idx + 1}. "${step.title}" (type: ${step.type}, id: ${step.id})`);
        });

        // Step 3: Delete orphaned steps
        for (const step of orphanedSteps) {
          await db.delete(steps).where(eq(steps.id, step.id));
          console.log(`    ✅ Deleted step "${step.title}"`);
          totalOrphanedSteps++;
        }
        console.log();
      }
    }

    if (totalOrphanedSteps === 0) {
      console.log('✅ No orphaned steps found. All Final Documents pages are clean!');
    } else {
      console.log(`✅ Cleanup complete! Deleted ${totalOrphanedSteps} orphaned step(s).`);
    }

  } catch (error: unknown) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupFinalPages()
  .then(() => {
    console.log('\n✨ Script completed successfully!');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
