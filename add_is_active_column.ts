import { db, initializeDatabase } from "./server/db";
import { sql } from "drizzle-orm";

async function run() {
  await initializeDatabase();
  try {
    console.log("Adding is_active column...");
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;`);
    console.log("Successfully added is_active column!");
  } catch (err) {
    console.error("Error adding column:", err);
  }
  process.exit(0);
}

run();
