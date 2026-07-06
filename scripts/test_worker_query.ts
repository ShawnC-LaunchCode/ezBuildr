import dotenv from "dotenv";
dotenv.config();
import { db, initializeDatabase } from "../server/db";
import { emailQueue } from "../shared/schema/integrations";
import { and, or, eq, lt, sql } from "drizzle-orm";

async function main() {
  await initializeDatabase();
  const jobs = await db.query.emailQueue.findMany({
    where: and(
        or(
            eq(emailQueue.status, 'pending'),
            and(
                eq(emailQueue.status, 'failed'),
                lt(emailQueue.attempts, 3),
                lt(emailQueue.nextAttemptAt, sql`now()`)
            )
        ),
        lt(emailQueue.nextAttemptAt, sql`now()`)
    ),
    limit: 5,
    orderBy: (emailQueue, { asc }) => [asc(emailQueue.nextAttemptAt)]
  });
  
  console.log("Worker query returned:", jobs.length, "jobs");
  console.log(jobs);
}

main().catch(console.error).finally(() => process.exit(0));
