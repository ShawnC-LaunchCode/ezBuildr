import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The 4 unit test files that require a real database (use describeWithDb)
const dbUnitTests = [
  "tests/unit/engine/templateNode.test.ts",
  "tests/unit/repositories/WorkflowTemplateRepository.test.ts",
  "tests/unit/services/PdfQueueService.test.ts",
  "tests/unit/services/WorkflowTenantResolver.db.test.ts",
  "tests/unit/services/WorkflowTemplateService.test.ts",
  "tests/unit/portability/exportService.test.ts",
  "tests/unit/portability/exportBlobs.test.ts",
  "tests/unit/portability/exportSecrets.test.ts",
  "tests/unit/portability/exportRedaction.test.ts",
  "tests/unit/portability/importPreview.test.ts",
  "tests/unit/portability/importApply.test.ts",
  "tests/unit/portability/importBlobs.test.ts",
  "tests/unit/portability/importConfigRefs.test.ts",
  "tests/unit/portability/importWithheldColumns.test.ts",
  "tests/unit/portability/importRename.test.ts",
  "tests/unit/services/StepService.db.test.ts",
  "tests/unit/scripts/migrateOptionAliases.db.test.ts",
  "tests/unit/services/document/delivery/DocumentDelivery.db.test.ts",
  "tests/unit/repositories/AiUsageRepository.test.ts",
  "tests/unit/middleware/runTokenAuth.tenant.db.test.ts",
  "tests/unit/repositories/ProjectRepository.ownership.test.ts",
];

// Integration tests excluded from the default run (require special setup)
const excludedIntegrationTests = [
  // Require real external credentials / services
  "tests/integration/*.real.test.ts",
];

const singleWorker = process.env.VITEST_SINGLE_FORK === 'true';

// Never oversubscribe the box. maxWorkers was a hardcoded 8, chosen on a
// 16-core dev machine; a GitHub-hosted runner has 4, so CI ran 8 workers on 4
// cores. That 2x oversubscription is what turned sub-second jsdom tests into
// 5s+ timeouts once the suite stopped running single-fork. Locally, on >=8
// cores, this still resolves to the same numbers as before.
const cpuCount = os.availableParallelism?.() ?? os.cpus().length;
const cap = (n: number) => (singleWorker ? 1 : Math.max(1, Math.min(n, cpuCount)));

// Shared config inherited by all projects via `extends: true`
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    fileParallelism: true,
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@server": path.resolve(__dirname, "./server"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
    server: {
      deps: {
        inline: ["multer"],
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
        lines: 5,
        functions: 4,
        branches: 2,
        statements: 5,
      },
    },
    // ── 3 Projects: unit-fast, unit-db, integration ──
    projects: [
      {
        extends: true,
        test: {
          name: "unit-fast",
          include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
          exclude: [...dbUnitTests, "node_modules/**/*"],
          setupFiles: ["./tests/setup-fast.ts"],
          hookTimeout: 10000,
          // NOT vitest's 5s default. This project is mostly jsdom + React
          // Testing Library + userEvent, whose interaction helpers yield to the
          // event loop repeatedly; on a loaded CI runner a perfectly healthy
          // component test takes well over 5s. The default only ever held
          // because the whole suite ran single-fork with the box to itself, and
          // when that changed it produced a DIFFERENT set of timeouts each run
          // (IntegrationHub + ReviewStep one build, PageSteps.a11y the one
          // before) -- the signature of a project-wide budget being wrong, not
          // of individual slow tests. 20s still fails a genuinely hung test
          // inside a ~90s project run. The axe-core scans, which are the
          // measurably slowest thing here, carry their own explicit 30s.
          testTimeout: 20000,
          maxWorkers: cap(8),
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        test: {
          name: "unit-db",
          include: dbUnitTests,
          setupFiles: ["./tests/setup.ts"],
          testTimeout: 30000,
          hookTimeout: 120000,
          maxWorkers: cap(4),
          sequence: { groupOrder: 2 },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          exclude: [...excludedIntegrationTests, "node_modules/**/*"],
          setupFiles: ["./tests/setup.ts"],
          testTimeout: 30000,
          hookTimeout: 120000,
          maxWorkers: cap(4),
          sequence: { groupOrder: 3 },
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@server": path.resolve(__dirname, "./server"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
