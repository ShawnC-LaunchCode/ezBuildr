import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

async function main() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);

  console.log("\n🔧 Checking and fixing transform_blocks table...\n");

  try {
    // Check if table exists
    const tableCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'transform_blocks'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log("❌ transform_blocks table does not exist. Creating it...");

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS transform_blocks (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
          section_id uuid REFERENCES sections(id) ON DELETE CASCADE,
          name varchar NOT NULL,
          language text NOT NULL,
          phase text NOT NULL DEFAULT 'onSectionSubmit',
          code text NOT NULL,
          input_keys text[] NOT NULL,
          output_key varchar NOT NULL,
          virtual_step_id uuid REFERENCES steps(id) ON DELETE SET NULL,
          enabled boolean NOT NULL DEFAULT true,
          "order" integer NOT NULL,
          timeout_ms integer DEFAULT 1000,
          created_at timestamp DEFAULT now(),
          updated_at timestamp DEFAULT now()
        );
      `);

      // Create indices
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS transform_blocks_workflow_idx ON transform_blocks(workflow_id);
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS transform_blocks_workflow_order_idx ON transform_blocks(workflow_id, "order");
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS transform_blocks_phase_idx ON transform_blocks(workflow_id, phase);
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS transform_blocks_virtual_step_idx ON transform_blocks(virtual_step_id);
      `);

      console.log("✅ transform_blocks table created successfully");
    } else {
      console.log("✓ transform_blocks table exists");

      // Check for missing columns and add them
      const columns = await db.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'transform_blocks';
      `);

      const existingColumns = new Set(columns.rows.map((row: any) => row.column_name));
      console.log("Existing columns:", Array.from(existingColumns).join(", "));

      const requiredColumns: Record<string, string> = {
        id: "uuid PRIMARY KEY DEFAULT gen_random_uuid()",
        workflow_id: "uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE",
        section_id: "uuid REFERENCES sections(id) ON DELETE CASCADE",
        name: "varchar NOT NULL",
        language: "text NOT NULL",
        phase: "text NOT NULL DEFAULT 'onSectionSubmit'",
        code: "text NOT NULL",
        input_keys: "text[] NOT NULL DEFAULT '{}'",
        output_key: "varchar NOT NULL",
        virtual_step_id: "uuid REFERENCES steps(id) ON DELETE SET NULL",
        enabled: "boolean NOT NULL DEFAULT true",
        order: "integer NOT NULL DEFAULT 0",
        timeout_ms: "integer DEFAULT 1000",
        created_at: "timestamp DEFAULT now()",
        updated_at: "timestamp DEFAULT now()"
      };

      let addedColumns = 0;

      for (const [columnName, columnDef] of Object.entries(requiredColumns)) {
        if (!existingColumns.has(columnName)) {
          console.log(`➕ Adding missing column: ${columnName}`);
          try {
            await db.execute(sql.raw(`
              ALTER TABLE transform_blocks
              ADD COLUMN IF NOT EXISTS ${columnName} ${columnDef};
            `));
            addedColumns++;
          } catch (error: any) {
            console.log(`⚠️  Could not add column ${columnName}:`, error.message);
          }
        }
      }

      if (addedColumns === 0) {
        console.log("✅ All required columns exist");
      } else {
        console.log(`✅ Added ${addedColumns} missing column(s)`);
      }

      // Create missing indices
      console.log("\n📋 Creating indices...");
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS transform_blocks_workflow_idx ON transform_blocks(workflow_id);
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS transform_blocks_workflow_order_idx ON transform_blocks(workflow_id, "order");
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS transform_blocks_phase_idx ON transform_blocks(workflow_id, phase);
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS transform_blocks_virtual_step_idx ON transform_blocks(virtual_step_id);
      `);
      console.log("✅ Indices created");
    }

    // Check if transform_block_runs table exists
    const runsTableCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'transform_block_runs'
      );
    `);

    if (!runsTableCheck.rows[0].exists) {
      console.log("\n📋 Creating transform_block_runs table...");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS transform_block_runs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
          block_id uuid NOT NULL REFERENCES transform_blocks(id) ON DELETE CASCADE,
          started_at timestamp NOT NULL DEFAULT now(),
          finished_at timestamp,
          status text NOT NULL,
          error_message text,
          output_sample jsonb,
          created_at timestamp DEFAULT now()
        );
      `);

      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS transform_block_runs_run_idx ON transform_block_runs(run_id);
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS transform_block_runs_block_idx ON transform_block_runs(block_id);
      `);

      console.log("✅ transform_block_runs table created");
    }

    // List all transform blocks
    const blocks = await db.execute(sql`
      SELECT id, name, workflow_id, language, phase, output_key, virtual_step_id
      FROM transform_blocks
      ORDER BY workflow_id, "order";
    `);

    console.log(`\n📊 Found ${blocks.rows.length} transform block(s):`);
    for (const block of blocks.rows) {
      console.log(`  - ${block.name} (${block.language}) -> ${block.output_key}`);
      console.log(`    Workflow: ${block.workflow_id}`);
      console.log(`    Virtual Step: ${block.virtual_step_id || "none"}`);
    }

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    throw error;
  } finally {
    await client.end();
  }

  console.log("\n✅ transform_blocks table check complete!");
}

main().catch(console.error);
