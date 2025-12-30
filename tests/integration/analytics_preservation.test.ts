
import { describe, it, expect, beforeAll } from 'vitest';
import { db, initializeDatabase } from '../../server/db';
import { users, systemStats } from '@shared/schema';
import { userRepository } from '../../server/repositories/UserRepository';
import { systemStatsRepository } from '../../server/repositories/SystemStatsRepository';
import { eq } from 'drizzle-orm';

describe('Analytics Preservation', () => {
    beforeAll(async () => {
        await initializeDatabase();
    });

    it('should preserve lifetime user count when a user is deleted', async () => {
        // 1. Get initial stats
        const initialStats = await systemStatsRepository.getStats();
        const initialTotalUsers = initialStats.totalUsersCreated;

        // 2. Create a test user
        const testEmail = `analytics-test-${Date.now()}@example.com`;
        const newUser = await userRepository.upsert({
            email: testEmail,
            firstName: 'Analytics',
            lastName: 'Test',
            role: 'creator',
        });

        // 3. Verify stats incremented
        const statsAfterCreate = await systemStatsRepository.getStats();
        expect(statsAfterCreate.totalUsersCreated).toBe(initialTotalUsers + 1);

        // 4. Delete the user
        // Determine how to delete. Using DB directly or repository if it has delete.
        // UserRepository doesn't seem to have delete (based on previous View).
        // Using DB delete.
        await db.delete(users).where(eq(users.id, newUser.id));

        // 5. Verify user is gone from users table
        const deletedUser = await userRepository.findByEmail(testEmail);
        expect(deletedUser).toBeUndefined();

        // 6. Verify lifetime stats are PRESERVED (did not decrement)
        const statsAfterDelete = await systemStatsRepository.getStats();
        expect(statsAfterDelete.totalUsersCreated).toBe(statsAfterCreate.totalUsersCreated);
        expect(statsAfterDelete.totalUsersCreated).toBe(initialTotalUsers + 1);
    });
});
