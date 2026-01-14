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
        lines: 18,
        functions: 13,
        branches: 12,
        statements: 18,
      },
    },
    hookTimeout: 120000,
    fileParallelism: true,
    pool: "forks", // Use forks to isolate tests
  },
  poolOptions: {
    forks: {
      // Use environment variable to control parallelization
      // Unit tests: parallel (safe)
      // Integration tests: parallel (safe with schema isolation)
      singleFork: false,
      minForks: 1,
      maxForks: 4, // Limit concurrency to avoid DB overload
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@server": path.resolve(__dirname, "./server"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
} as any);
