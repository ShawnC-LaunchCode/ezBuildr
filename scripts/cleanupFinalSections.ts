/**
 * Cleanup Script: Remove orphaned questions from Final Documents sections
 *
 * Purpose: Delete any non-system steps (questions) that exist in Final Documents sections.
 * Final Documents sections should only contain a single system step of type 'final_documents'.
 *
 * This script:
 * 1. Finds all sections with config.finalBlock = true
 * 2. Identifies steps in those sections that are NOT type 'final_documents'
 * 3. Deletes those orphaned steps
 *
 * Usage: npx tsx scripts/cleanupFinalSections.ts
 */

import { db } from '../server/db';
import { sections, steps } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';

async function cleanupFinalSections() {
  console.log('🧹 Starting cleanup of Final Documents sections...\n');

  try {
    // Step 1: Find all Final Documents sections
    const finalSections = await db
      .select({
        id: sections.id,
        title: sections.title,
        workflowId: sections.workflowId,
      })
      .from(sections)
      .where(sql`${sections.config}->>'finalBlock' = 'true'`);

    console.log(`Found ${finalSections.length} Final Documents section(s):\n`);
    finalSections.forEach((section, idx) => {
      console.log(`  ${idx + 1}. "${section.title}" (${section.id})`);
    });
    console.log();

    if (finalSections.length === 0) {
      console.log('✅ No Final Documents sections found. Nothing to clean up.');
      return;
    }

    // Step 2: Find orphaned steps (non-system steps in final sections)
    let totalOrphanedSteps = 0;

    for (const section of finalSections) {
      const orphanedSteps = await db
        .select({
          id: steps.id,
          title: steps.title,
          type: steps.type,
        })
        .from(steps)
        .where(
          sql`${steps.sectionId} = ${section.id} AND ${steps.type} != 'final_documents'`
        );

      if (orphanedSteps.length > 0) {
        console.log(`📋 Section "${section.title}" has ${orphanedSteps.length} orphaned step(s):`);
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
      console.log('✅ No orphaned steps found. All Final Documents sections are clean!');
    } else {
      console.log(`✅ Cleanup complete! Deleted ${totalOrphanedSteps} orphaned step(s).`);
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupFinalSections()
  .then(() => {
    console.log('\n✨ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
