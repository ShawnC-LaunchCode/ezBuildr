import { config } from 'dotenv';
config({ override: true });
import { emailQueueService } from './server/services/EmailQueueService';
import { db, initializeDatabase } from './server/db';
import { emailQueue } from './shared/schema';
import { eq } from 'drizzle-orm';

async function run() {
    await initializeDatabase();
    console.log("Forcing email queue processing by bypassing nextAttemptAt filter...");
    try {
        const jobs = await db.query.emailQueue.findMany({
            where: eq(emailQueue.status, 'pending'),
            limit: 5
        });

        console.log(`Found ${jobs.length} pending jobs.`);
        for (const job of jobs) {
            console.log(`Processing job ${job.id}`);
            try {
                await (emailQueueService as any).processJob(job);
                console.log(`Successfully processed job ${job.id}`);
            } catch (jobErr) {
                console.error(`Error processing job ${job.id}:`, jobErr);
                if (jobErr instanceof Error) {
                    console.error(jobErr.stack);
                }
            }
        }
        
        console.log("Finished processing.");
    } catch (e) {
        console.error("Top level error:", e);
        if (e instanceof Error) {
            console.error(e.stack);
        }
    }
    process.exit(0);
}
run();
