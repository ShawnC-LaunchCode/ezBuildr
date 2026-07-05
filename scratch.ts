import 'dotenv/config';
import { db, initializeDatabase } from './server/db';
import { emailQueue } from './shared/schema';
import { desc } from 'drizzle-orm';

async function checkEmails() {
    try {
        await initializeDatabase();
        const emails = await db.select()
            .from(emailQueue)
            .orderBy(desc(emailQueue.updatedAt))
            .limit(5);
        
        if (emails.length === 0) {
            console.log("No emails found in the email_queue table.");
        } else {
            console.log("Last 5 emails in queue:");
            console.log(JSON.stringify(emails, null, 2));
        }
    } catch (e) {
        console.error("Error querying db:", e);
    }
    process.exit(0);
}

checkEmails();
