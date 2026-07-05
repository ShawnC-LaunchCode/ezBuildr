
import sgMail from '@sendgrid/mail';
import { eq, and, lt, or, sql } from "drizzle-orm";

import { emailQueue } from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";
import { ActivityLogService } from "./ActivityLogService";

const logger = createLogger({ module: 'email-queue' });

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? 'noreply@ezbuildr.com';

export class EmailQueueService {
    private isProcessing = false;
    private pollInterval: NodeJS.Timeout | null = null;
    private activityLogger = new ActivityLogService();

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

            if (job == null) {throw new Error("Failed to add email to queue");}

            logger.info({ jobId: job.id, to, subject }, 'Email added to queue');
            
            // Log to Admin Logs asynchronously
            this.activityLogger.log('Email Queued', { 
                entityType: 'email',
                metadata: { to, subject, jobId: job.id } 
            }).catch(e => logger.error({err: e}, 'Failed to log Email Queued activity'));

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
    startWorker(intervalMs: number = 5000): void {
        if (this.pollInterval) { return; }

        logger.info({ intervalMs }, 'Starting email queue worker');
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.pollInterval = setInterval(() => this.processQueue(), intervalMs);
    }

    /**
     * Stop the worker
     */
    stopWorker(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            logger.info('Stopped email queue worker');
        }
    }

    /**
     * Process pending jobs
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing) { return; }
        this.isProcessing = true;

        try {
            // Find pending jobs
            // Also retry stuck 'processing' jobs that are old (timeout > 5 mins)
            // Or failed jobs with < 3 attempts
            const jobs = await db.query.emailQueue.findMany({
                where: and(
                    or(
                        eq(emailQueue.status, 'pending'),
                        // Retry logic: created before now (already supported by nextAttemptAt logic we added?)
                        // Actually schema has nextAttemptAt. Use that.
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

    private async processJob(job: typeof emailQueue.$inferSelect): Promise<void> {
        // Mark as processing
        await db.update(emailQueue)
            .set({ status: 'processing', updatedAt: sql`now()` })
            .where(eq(emailQueue.id, job.id));

        try {
            // Attempt Send
            logger.debug({ jobId: job.id }, 'Sending email');
            await this.sendDirectly(job.to, job.subject, job.html);

            // Mark complete
            await db.update(emailQueue)
                .set({ status: 'completed', updatedAt: sql`now()`, lastError: null })
                .where(eq(emailQueue.id, job.id));

            logger.info({ jobId: job.id }, 'Email job completed');

            // Log to Admin Logs asynchronously
            this.activityLogger.log('Email Sent', { 
                entityType: 'email',
                metadata: { to: job.to, subject: job.subject, jobId: job.id } 
            }).catch(e => logger.error({err: e}, 'Failed to log Email Sent activity'));

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const attempts = job.attempts + 1;
            const isFinal = attempts >= 3;

            let interval = '0 minutes';
            if (attempts === 1) { interval = '1 minute'; }
            else if (attempts === 2) { interval = '5 minutes'; }

            await db.update(emailQueue)
                .set({
                    status: isFinal ? 'failed' : 'pending', // Revert to pending for retry usually, but our query checks failed too
                    // Actually, keep as 'failed' and let query pick up 'failed' with retries < 3
                    attempts: attempts,
                    lastError: errorMessage,
                    updatedAt: sql`now()`,
                    nextAttemptAt: sql`now() + interval '${sql.raw(interval)}'`
                })
                .where(eq(emailQueue.id, job.id));

            logger.error({ jobId: job.id, attempts, error: errorMessage }, 'Email job failed');

            // Log to Admin Logs asynchronously
            this.activityLogger.log('Email Failed', { 
                entityType: 'email',
                metadata: { to: job.to, subject: job.subject, jobId: job.id, attempts, error: errorMessage } 
            }).catch(e => logger.error({err: e}, 'Failed to log Email Failed activity'));
        }
    }

    // Direct send helper (logic copied from original emailService)
    private async sendDirectly(to: string, subject: string, html: string): Promise<void> {
        if (process.env.SENDGRID_API_KEY) {
            sgMail.setApiKey(process.env.SENDGRID_API_KEY);
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
