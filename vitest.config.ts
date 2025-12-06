import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**/*", "node_modules/**/*"],
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
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks", // Use forks to isolate tests
    poolOptions: {
      forks: {
        singleFork: true // Run tests in a single fork for better DB isolation
      }
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@server": path.resolve(__dirname, "./server"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
