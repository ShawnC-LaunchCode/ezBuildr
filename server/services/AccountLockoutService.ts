import { eq, and, gte, lt } from "drizzle-orm";

import { loginAttempts, accountLocks } from "@shared/schema";

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
    }

    /**
     * Check if account should be locked based on failed attempts
     */
    async checkAndLockAccount(_email: string): Promise<void> {
        // No-op: We now evaluate lockouts dynamically based on (Email, IP) in isAccountLocked
        // This prevents targeted DoS attacks that intentionally lock out legitimate users globally.
    }

    /**
     * Check if account is currently locked for a specific IP or manually locked
     */
    async isAccountLocked(userId: string, email?: string, ipAddress?: string): Promise<{ locked: boolean; lockedUntil?: Date }> {
        const now = new Date();

        // 1. Check for manual/administrative global locks
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

        // 2. Check for dynamic (Email + IP) automatic lockout
        if (email && ipAddress) {
            const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
            const recentFailedAttempts = await this.db.query.loginAttempts.findMany({
                where: and(
                    eq(loginAttempts.email, email),
                    eq(loginAttempts.ipAddress, ipAddress),
                    eq(loginAttempts.successful, false),
                    gte(loginAttempts.attemptedAt, windowStart)
                )
            });

            if (recentFailedAttempts.length >= MAX_FAILED_ATTEMPTS) {
                const mostRecentAttemptAt = recentFailedAttempts.reduce<Date | null>((latest, attempt) => {
                    if (attempt.attemptedAt === null) { return latest; }
                    if (latest === null || attempt.attemptedAt > latest) { return attempt.attemptedAt; }
                    return latest;
                }, null);

                if (mostRecentAttemptAt === null) {
                    return { locked: false };
                }

                const lockedUntil = new Date(mostRecentAttemptAt.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
                
                if (lockedUntil > now) {
                    return { locked: true, lockedUntil };
                }
            }
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
