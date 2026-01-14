import { beforeAll, afterAll, beforeEach } from 'vitest';

import { cleanAuthTables } from './helpers/testUtils';

/**
 * Auth Test Setup
 * Runs before all auth tests
 */

beforeAll(async () => {
  console.log('🔧 Setting up auth test environment...');

  // Ensure JWT_SECRET is set for tests
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';
  }

  if (!process.env.VL_MASTER_KEY) {
    process.env.VL_MASTER_KEY = Buffer.from('0'.repeat(32)).toString('base64');
  }

  console.log('✅ Auth test environment ready');
});

// Cleanup hooks removed to support parallel execution (Logical Isolation)
// Each test is responsible for cleaning up its own data via deleteTestUser()
