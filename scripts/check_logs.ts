import dotenv from "dotenv";
dotenv.config();
import { initializeDatabase } from "../server/db";
import { ActivityLogService } from "../server/services/ActivityLogService";

async function main() {
  await initializeDatabase();
  const logger = new ActivityLogService();
  
  try {
    const result = await logger.list({});
    console.log("Total returned by list():", result.total);
    console.log("Rows returned by list():", result.rows.length);
    console.log(result.rows);
  } catch (err) {
    console.error("Failed to list logs:", err);
  }
}

main().catch(console.error).finally(() => process.exit(0));
