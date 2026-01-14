
import sgMail from '@sendgrid/mail';
import { eq, and, lt, or } from "drizzle-orm";

import { emailQueue } from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";


const logger = createLogger({ module: 'email-queue' });

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@ezbuildr.com';

export class EmailQueueService {
    private isProcessing = false;
    private pollInterval: NodeJS.Timeout | null = null;

    /**
     * Add an email to the queue (Non-blocking)
     */
    async addToQueue(to: string, subject: string, html: string): Promise<string> {
        try {
            const [job] = await db.insert(emailQueue).values({
                to,
                subject,
                html,
                status: 'pending',
                attempts: 0
            }).returning({ id: emailQueue.id });

            logger.info({ jobId: job.id, to, subject }, 'Email added to queue');
            return job.id;
        } catch (error) {
            logger.error({ error, to, subject }, 'Failed to add email to queue');
            // Fallback: Try to send directly if DB fails? 
            // Or throw to let caller handle?
            // For now, let's throw so the user sees an error if the system is totally broken.
            throw error;
        }
    }

    /**
     * Start the worker
     */
    startWorker(intervalMs: number = 5000) {
        if (this.pollInterval) {return;}

        logger.info({ intervalMs }, 'Starting email queue worker');
        this.pollInterval = setInterval(() => this.processQueue(), intervalMs);
    }

    /**
     * Stop the worker
     */
    stopWorker() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            logger.info('Stopped email queue worker');
        }
    }

    /**
     * Process pending jobs
     */
    private async processQueue() {
        if (this.isProcessing) {return;}
        this.isProcessing = true;

        try {
            // Find pending jobs
            // Also retry stuck 'processing' jobs that are old (timeout > 5 mins)
            // Or failed jobs with < 3 attempts
            const now = new Date();

            const jobs = await db.query.emailQueue.findMany({
                where: and(
                    or(
                        eq(emailQueue.status, 'pending'),
                        // Retry logic: created before now (already supported by nextAttemptAt logic we added?)
                        // Actually schema has nextAttemptAt. Use that.
                        and(
                            eq(emailQueue.status, 'failed'),
                            lt(emailQueue.attempts, 3),
                            lt(emailQueue.nextAttemptAt, now)
                        )
                    ),
                    lt(emailQueue.nextAttemptAt, now)
                ),
                limit: 5,
                orderBy: (emailQueue, { asc }) => [asc(emailQueue.nextAttemptAt)]
            });

            if (jobs.length > 0) {
                logger.debug({ count: jobs.length }, 'Processing email jobs');
            }

            for (const job of jobs) {
                await this.processJob(job);
            }

        } catch (error) {
            logger.error({ error }, 'Error in email queue processor');
        } finally {
            this.isProcessing = false;
        }
    }

    private async processJob(job: typeof emailQueue.$inferSelect) {
        // Mark as processing
        await db.update(emailQueue)
            .set({ status: 'processing', updatedAt: new Date() })
            .where(eq(emailQueue.id, job.id));

        try {
            // Attempt Send
            logger.debug({ jobId: job.id }, 'Sending email');
            await this.sendDirectly(job.to, job.subject, job.html);

            // Mark complete
            await db.update(emailQueue)
                .set({ status: 'completed', updatedAt: new Date(), lastError: null })
                .where(eq(emailQueue.id, job.id));

            logger.info({ jobId: job.id }, 'Email job completed');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const attempts = job.attempts + 1;
            const isFinal = attempts >= 3;

            // Exponential backoff: 1m, 5m, 15m
            const nextAttempt = new Date();
            if (attempts === 1) {nextAttempt.setMinutes(nextAttempt.getMinutes() + 1);}
            else if (attempts === 2) {nextAttempt.setMinutes(nextAttempt.getMinutes() + 5);}

            await db.update(emailQueue)
                .set({
                    status: isFinal ? 'failed' : 'pending', // Revert to pending for retry usually, but our query checks failed too
                    // Actually, keep as 'failed' and let query pick up 'failed' with retries < 3
                    attempts: attempts,
                    lastError: errorMessage,
                    updatedAt: new Date(),
                    nextAttemptAt: nextAttempt
                })
                .where(eq(emailQueue.id, job.id));

            logger.error({ jobId: job.id, attempts, error: errorMessage }, 'Email job failed');
        }
    }

    // Direct send helper (logic copied from original emailService)
    private async sendDirectly(to: string, subject: string, html: string): Promise<void> {
        if (process.env.SENDGRID_API_KEY) {
            await sgMail.send({
                to,
                from: FROM_EMAIL,
                subject,
                html,
            });
        } else {
            // Log mode
            logger.info({ to, subject, htmlLength: html.length }, 'Email logged (no API key)');
        }
    }
}

export const emailQueueService = new EmailQueueService();
