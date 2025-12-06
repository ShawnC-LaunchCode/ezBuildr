/**
 * Test Utilities for Parallelization-Safe Testing
 *
 * These utilities help create unique test data that won't collide
 * when tests run in parallel.
 */

import { nanoid } from "nanoid";

/**
 * Generate a unique test ID that's safe for parallel execution
 *
 * @param prefix - Optional prefix for readability
 * @returns Unique ID like "test-abc123def456"
 */
export function uniqueTestId(prefix: string = "test"): string {
  return `${prefix}-${nanoid(12)}`;
}

/**
 * Generate a unique email for test users
 *
 * @param prefix - Email prefix (e.g., "user", "admin")
 * @returns Unique email like "user-abc123@test.example.com"
 */
export function uniqueTestEmail(prefix: string = "user"): string {
  return `${prefix}-${nanoid(12)}@test.example.com`;
}

/**
 * Generate a unique name for test entities
 *
 * @param type - Type of entity (e.g., "Project", "Workflow")
 * @param purpose - Optional purpose (e.g., "Move Test")
 * @returns Unique name like "Project - Move Test - abc123"
 */
export function uniqueTestName(type: string, purpose?: string): string {
  const parts = [type];
  if (purpose) parts.push(purpose);
  parts.push(nanoid(8));
  return parts.join(" - ");
}

/**
 * Sleep for a specified duration (useful for waiting between operations)
 *
 * @param ms - Milliseconds to sleep
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 *
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries
 * @param initialDelay - Initial delay in ms
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Generate a unique port number for test servers
 *
 * Returns a random port in the range 30000-60000 to avoid conflicts
 */
export function uniqueTestPort(): number {
  return Math.floor(Math.random() * 30000) + 30000;
}
