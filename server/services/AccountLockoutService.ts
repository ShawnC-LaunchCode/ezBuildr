import { eq, and, gte, lt } from "drizzle-orm";

import { loginAttempts, accountLocks, users } from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";

const log = createLogger({ module: 'account-lockout' });

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const ATTEMPT_WINDOW_MINUTES = 15;

export class AccountLockoutService {
    private db: typeof db;

    constructor(database = db) {
        this.db = database;
    }

    /**
     * Record a login attempt
     */
    async recordAttempt(email: string, ipAddress: string | undefined, successful: boolean): Promise<void> {
        await this.db.insert(loginAttempts).values({
            email,
            ipAddress,
            successful,
            attemptedAt: new Date()
        });

        if (!successful) {
            await this.checkAndLockAccount(email);
        } else {
            // Successful login - account not locked
            // Old failed attempts will be cleaned up by cleanup job
        }
    }

    /**
     * Check if account should be locked based on failed attempts
     */
    async checkAndLockAccount(email: string): Promise<void> {
        const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);

        const recentFailedAttempts = await this.db.query.loginAttempts.findMany({
            where: and(
                eq(loginAttempts.email, email),
                eq(loginAttempts.successful, false),
                gte(loginAttempts.attemptedAt, windowStart)
            )
        });

        if (recentFailedAttempts.length >= MAX_FAILED_ATTEMPTS) {
            const user = await this.db.query.users.findFirst({
                where: eq(users.email, email)
            });

            if (user) {
                const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);

                await this.db.insert(accountLocks).values({
                    userId: user.id,
                    lockedAt: new Date(),
                    lockedUntil,
                    reason: 'too_many_failed_attempts',
                    unlocked: false
                });

                log.warn({ userId: user.id, email, lockedUntil }, 'Account locked due to too many failed attempts');
            }
        }
    }

    /**
     * Check if account is currently locked
     */
    async isAccountLocked(userId: string): Promise<{ locked: boolean; lockedUntil?: Date }> {
        const now = new Date();

        const activeLock = await this.db.query.accountLocks.findFirst({
            where: and(
                eq(accountLocks.userId, userId),
                eq(accountLocks.unlocked, false),
                gte(accountLocks.lockedUntil, now)
            ),
            orderBy: (accountLocks, { desc }) => [desc(accountLocks.lockedAt)]
        });

        if (activeLock) {
            return { locked: true, lockedUntil: activeLock.lockedUntil };
        }

        return { locked: false };
    }

    /**
     * Manually unlock an account (admin action)
     */
    async unlockAccount(userId: string): Promise<void> {
        await this.db.update(accountLocks)
            .set({ unlocked: true })
            .where(eq(accountLocks.userId, userId));

        log.info({ userId }, 'Account manually unlocked');
    }

    /**
     * Cleanup old login attempts (call from token cleanup job)
     */
    async cleanupOldAttempts(): Promise<void> {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        await this.db.delete(loginAttempts)
            .where(lt(loginAttempts.attemptedAt, thirtyDaysAgo));

        log.info('Cleaned up old login attempts');
    }
}

export const accountLockoutService = new AccountLockoutService();
