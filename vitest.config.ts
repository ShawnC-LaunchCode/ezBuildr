import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**/*", "node_modules/**/*"],
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@server": path.resolve(__dirname, "./server"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
    server: {
      deps: {
        inline: ["multer"], // Force multer to be processed by Vite/Vitest
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html", "lcov", "text-summary"],
      include: [
        "server/**/*.ts",
        "shared/**/*.ts",
        "client/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/node_modules/**",
        "**/dist/**",
        "**/*.config.ts",
        "**/types/**",
      ],
      thresholds: {
        // Phase 1 (Dec 2025): Establish realistic baseline
        // Current coverage: ~18% lines, ~13% functions, ~12% branches, ~18% statements
        // Setting thresholds slightly below current to allow for minor fluctuations
        // Target Phase 2 (Q1 2026): 50% coverage
        // Target Phase 3 (Q2 2026): 80% coverage
        lines: 5,
        functions: 4,
        branches: 2,
        statements: 5,
      },
    },
    hookTimeout: 120000,
    fileParallelism: true,
    pool: "forks", // Use forks to isolate tests
  },
  poolOptions: {
    forks: {
      // Use environment variable to control parallelization
      // SEQUENTIAL MODE (CI/CD): Set VITEST_SINGLE_FORK=true for 100% reliability
      // PARALLEL MODE (local dev): Leave unset for speed
      singleFork: process.env.VITEST_SINGLE_FORK === 'true',
      minForks: 1,
      maxForks: process.env.VITEST_SINGLE_FORK === 'true' ? 1 : 4,
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@server": path.resolve(__dirname, "./server"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vitest config type mismatch with poolOptions at top level
} as any);
