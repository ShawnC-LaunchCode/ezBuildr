import dotenv from "dotenv";
dotenv.config();
import { initializeDatabase } from "../server/db";
import { ActivityLogService } from "../server/services/ActivityLogService";

async function main() {
  await initializeDatabase();
  const logger = new ActivityLogService();
  
  try {
    await logger.log("Test Log", {
      entityType: "user",
      entityId: "1234",
      actorEmail: "test@example.com",
      metadata: { test: true }
    });
    console.log("Successfully inserted log!");
  } catch (err) {
    console.error("Failed to insert log:", err);
  }
}

main().catch(console.error).finally(() => process.exit(0));
