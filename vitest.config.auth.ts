import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'auth-tests',
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.auth.ts'],
    include: [
      'tests/unit/services/AuthService.test.ts',
      'tests/unit/services/MfaService.test.ts',
      'tests/unit/services/AccountLockoutService.test.ts',
    ],
    coverage: {
      provider: 'v8',
      // json-summary produces coverage/coverage-summary.json, which the
      // auth-tests workflow reads to build its step summary. Without it that
      // step silently reported "Coverage report not found" on every green run.
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: [
        'server/services/AuthService.ts',
        'server/services/MfaService.ts',
        'server/services/AccountLockoutService.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
      all: true,
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '~': path.resolve(__dirname, './'),
    },
  },
});
