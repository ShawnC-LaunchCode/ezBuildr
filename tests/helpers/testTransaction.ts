import { getDb } from '../../server/db';
import type {  } from 'drizzle-orm/pg-core';
/**
 * Transaction-based Test Isolation
 *
 * Provides utilities for running tests in database transactions
 * that are automatically rolled back, ensuring complete test isolation.
 *
 * RECOMMENDED USAGE (runInTransaction):
 * ```typescript
 * import { runInTransaction } from '../helpers/testTransaction';
 *
 * it('should do something', async () => {
 *   await runInTransaction(async (tx) => {
 *     // Use tx for all database operations
 *     await tx.insert(schema.users).values({...});
 *     // Automatic rollback when function completes!
 *   });
 * });
 * ```
 */
/**
 * @deprecated Use runInTransaction() instead - this pattern uses a never-resolving
 * promise which is an anti-pattern and can cause memory leaks and unpredictable behavior.
 *
 * This function will be removed in v2.0.0 (January 2026).
 *
 * Migration:
 * ```typescript
 * // OLD (deprecated):
 * let tx;
 * beforeEach(async () => { tx = await beginTestTransaction(); });
 * afterEach(async () => { await rollbackTestTransaction(tx); });
 *
 * // NEW (recommended):
 * it('test', async () => {
 *   await runInTransaction(async (tx) => {
 *     // Test code here
 *   });
 * });
 * ```
 */
export async function beginTestTransaction(): Promise<any> {
  console.warn(
    'DEPRECATION WARNING: beginTestTransaction() is deprecated and will be removed in v2.0.0. ' +
    'Use runInTransaction() instead. See TESTING_STRATEGY.md for migration guide.'
  );
  const db = getDb() as any;
  // This pattern is fundamentally flawed - uses never-resolving promise
  return new Promise((resolve, reject) => {
    db.transaction(async (tx: any) => {
      resolve(tx);
      // Never resolves - keeps transaction open (anti-pattern)
      await new Promise(() => { });
    }).catch((error: any) => {
      if (error?.message?.includes('rollback') || error?.code === '25P02') {
        resolve(undefined);
      } else {
        reject(error);
      }
    });
  });
}
/**
 * @deprecated Use runInTransaction() instead - this pattern is fragile and uses
 * raw SQL which may not work correctly with all connection types.
 *
 * This function will be removed in v2.0.0 (January 2026).
 */
export async function rollbackTestTransaction(tx: any): Promise<void> {
  console.warn(
    'DEPRECATION WARNING: rollbackTestTransaction() is deprecated and will be removed in v2.0.0. ' +
    'Use runInTransaction() instead.'
  );
  if (!tx) {return;}
  try {
    // Force rollback using raw SQL (fragile, PostgreSQL-specific)
    await tx.execute('ROLLBACK');
  } catch (error) {
    // Rollback errors are expected
  }
}
/**
 * Savepoint utilities for nested transactions
 * Useful when you need to test partial rollback behavior
 *
 * Note: These use raw SQL and are PostgreSQL-specific. Use with caution.
 */
export async function createSavepoint(tx: any, name: string): Promise<void> {
  await tx.execute(`SAVEPOINT ${name}`);
}
export async function rollbackToSavepoint(tx: any, name: string): Promise<void> {
  await tx.execute(`ROLLBACK TO SAVEPOINT ${name}`);
}
export async function releaseSavepoint(tx: any, name: string): Promise<void> {
  await tx.execute(`RELEASE SAVEPOINT ${name}`);
}
/**
 * Run a test function in a transaction with automatic rollback (RECOMMENDED)
 *
 * This is the primary pattern for database testing in VaultLogic.
 * All database changes are automatically rolled back after the test function completes,
 * ensuring complete test isolation with no cleanup code required.
 *
 * @param testFn - Test function that receives a transaction object
 * @returns The result of the test function
 *
 * @example
 * ```typescript
 * import { runInTransaction } from '../helpers/testTransaction';
 * import { TestFactory } from '../helpers/testFactory';
 * import * as schema from '@shared/schema';
 *
 * describe('WorkflowService', () => {
 *   it('should create workflow in database', async () => {
 *     await runInTransaction(async (tx) => {
 *       // Create test data
 *       const [user] = await tx.insert(schema.users).values({
 *         id: '123',
 *         email: 'test@example.com',
 *       }).returning();
 *
 *       // Test your service
 *       const service = new WorkflowService(tx);
 *       const workflow = await service.createWorkflow({
 *         title: 'Test',
 *         createdBy: user.id,
 *       });
 *
 *       // Assert
 *       expect(workflow.id).toBeDefined();
 *
 *       // Transaction rolls back automatically - no cleanup needed!
 *     });
 *   });
 * });
 * ```
 */
export async function runInTransaction<T>(
  testFn: (tx: any) => Promise<T>
): Promise<T> {
  const db = getDb() as any;
  let result: T;
  try {
    await db.transaction(async (tx: any) => {
      result = await testFn(tx);
      // Force rollback by throwing a specific error
      throw new Error('ROLLBACK_TEST_TRANSACTION');
    });
  } catch (error: any) {
    // If it's our rollback signal, swallow it and return the result
    if (error?.message === 'ROLLBACK_TEST_TRANSACTION') {
      return result!;
    }
    // Otherwise, re-throw the actual error
    throw error;
  }
  // This line should never be reached
  return result!;
}
/**
 * Helper to truncate all tables (use sparingly, prefer transactions)
 * This is useful for integration tests that need a clean slate
 */
export async function truncateAllTables(): Promise<void> {
  const db = getDb() as any;
  // Disable foreign key checks temporarily
  await db.execute('SET session_replication_role = replica;');
  try {
    // Get all table names
    const tables = await db.execute(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE 'drizzle%'
    `);
    // Truncate all tables
    for (const { tablename } of tables.rows || []) {
      await db.execute(`TRUNCATE TABLE "${tablename}" CASCADE`);
    }
  } finally {
    // Re-enable foreign key checks
    await db.execute('SET session_replication_role = DEFAULT;');
  }
}