import dotenv from "dotenv";
dotenv.config();
import { db, initializeDatabase } from "../server/db";
import { emailQueueService } from "../server/services/EmailQueueService";

async function main() {
  await initializeDatabase();
  console.log("Forcing queue processing...");
  // Using an ugly hack to call the private method for testing
  await (emailQueueService as any).processQueue();
  console.log("Queue processing complete.");
  
  const jobs = await db.query.emailQueue.findMany({
    orderBy: (emailQueue, { desc }) => [desc(emailQueue.createdAt)],
    limit: 5
  });
  console.log("Latest jobs:", jobs.map(j => ({ id: j.id, status: j.status, attempts: j.attempts, lastError: j.lastError })));
}

main().catch(console.error).finally(() => process.exit(0));
