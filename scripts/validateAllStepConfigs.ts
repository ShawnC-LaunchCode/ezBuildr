import { db, initializeDatabase } from "../server/db";
import { sql } from "drizzle-orm";
import { validateStepConfig } from "@shared/validation/stepConfigSchemas";

async function run() {
    console.log("Starting step config validation...");
    await initializeDatabase();
    
    const allStepsResult = await db.execute(sql`SELECT "id", "type", "config" FROM "steps"`);
    const allSteps = allStepsResult.rows as any[];
    console.log(`Found ${allSteps.length} steps to validate.`);

    let validCount = 0;
    let invalidCount = 0;
    
    // Group errors by step type
    const errorsByType: Record<string, { stepId: string, error: any }[]> = {};

    for (const step of allSteps) {
        if (!step.config) {
            validCount++;
            continue;
        }

        const type = step.type;
        if (!type) {
            validCount++;
            continue;
        }

        const result = validateStepConfig(type, step.config);
        if (result.success) {
            validCount++;
        } else {
            invalidCount++;
            if (!errorsByType[type]) {
                errorsByType[type] = [];
            }
            errorsByType[type].push({
                stepId: step.id,
                error: result.error
            });
        }
    }

    console.log(`\n--- Validation Summary ---`);
    console.log(`Total Steps: ${allSteps.length}`);
    console.log(`Valid: ${validCount}`);
    console.log(`Invalid: ${invalidCount}`);

    if (invalidCount > 0) {
        console.log(`\n--- Errors by Type (First 5 per type) ---`);
        for (const [type, errors] of Object.entries(errorsByType)) {
            console.log(`\nType: ${type} (${errors.length} errors)`);
            const first5 = errors.slice(0, 5);
            for (const { stepId, error } of first5) {
                console.log(`  Step ID: ${stepId}`);
                console.log(`  Error: ${error.message}`);
            }
        }
    }
    
    process.exit(0);
}

run().catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
});
