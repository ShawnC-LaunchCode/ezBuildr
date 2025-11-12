import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { transformBlocks } from "../shared/schema";
import { eq } from "drizzle-orm";

const workflowId = "d4122e80-1d49-4d58-bfd4-4d4bdcd49843";

async function main() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);

  console.log(`\nChecking transform blocks for workflow: ${workflowId}\n`);

  const blocks = await db
    .select()
    .from(transformBlocks)
    .where(eq(transformBlocks.workflowId, workflowId));

  console.log(`Found ${blocks.length} transform blocks:\n`);

  blocks.forEach((block, i) => {
    console.log(`Block ${i + 1}:`);
    console.log(`  ID: ${block.id}`);
    console.log(`  Name: ${block.name}`);
    console.log(`  Language: ${block.language}`);
    console.log(`  Phase: ${block.phase}`);
    console.log(`  Section ID: ${block.sectionId || "null"}`);
    console.log(`  Virtual Step ID: ${block.virtualStepId || "null"}`);
    console.log(`  Output Key: ${block.outputKey}`);
    console.log(`  Input Keys: ${JSON.stringify(block.inputKeys)}`);
    console.log(`  Enabled: ${block.enabled}`);
    console.log(`  Order: ${block.order}`);
    console.log(`  Code length: ${block.code?.length || 0} chars`);
    console.log("");
  });

  await client.end();
}

main().catch(console.error);
