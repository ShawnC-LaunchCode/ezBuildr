import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'integration-tests',
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts', './tests/setup.auth.ts'],
    include: [
      'tests/integration/auth.routes.real.test.ts',
      'tests/integration/auth.flows.real.test.ts',
      'tests/integration/session.management.real.test.ts',
      'tests/integration/mfa.flow.real.test.ts',
      'tests/integration/trusted.devices.real.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'server/routes/auth.routes.ts',
        'server/middleware/auth.ts',
        'server/services/AuthService.ts',
        'server/services/MfaService.ts',
        'server/services/AccountLockoutService.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
      all: true,
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: true,
    pool: 'forks',
  },
  poolOptions: {
    forks: {
      singleFork: false,
      minForks: 1,
      maxForks: 4,
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '~': path.resolve(__dirname, './'),
    },
  },
});
