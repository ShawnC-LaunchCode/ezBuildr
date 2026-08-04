import { beforeAll, afterAll, beforeEach, afterEach, vi, expect } from "vitest";
import dotenv from "dotenv";

// import "@testing-library/jest-dom";
import { SchemaManager } from "./helpers/schemaManager";
declare global {
  // eslint-disable-next-line no-var
  var __BASE_DB_URL__: string;
  // eslint-disable-next-line no-var
  var __TEST_SCHEMA__: string;
}
// Load environment variables immediately
dotenv.config();
/**
 * Global test setup file
 * Runs before all tests
 */
// Define db and helpers at file scope but initialize them dynamically

let db: any;

let initializeDatabase: any;

let dbInitPromise: any;
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.VITE_GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || "test-google-client-id";
// Must be 32+ chars for strict Zod validation
process.env.JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars-long";
// Required for server startup (encryption utils) - 32 bytes base64 encoded
process.env.VL_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
// AI SDKs are mocked; a non-empty key must exist BEFORE any test-file import so
// the module-level AI service singletons (e.g. DocumentAIAssistService) construct
// their mocked client instead of silently degrading to null (empty responses).
// CI has no GEMINI_API_KEY, and per-test-file `process.env` assignments run too
// late because ESM imports (which build the singleton) are hoisted above them.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key";
// Tests create/drop schemas and mutate data, so they MUST run against a
// disposable local/test database — never the app's DATABASE_URL, which may
// point at a shared cloud dev DB (that's how 355 stray test_schema_* schemas
// once accumulated on Neon). Resolve the test DB from TEST_DATABASE_URL, else a
// local default; ignore the inherited DATABASE_URL entirely.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ezbuildr_test";
// Fail closed: refuse to run the DB-mutating setup against a remote host unless
// explicitly opted in. This is the guardrail that stops tests polluting a
// cloud database ever again.
{
  const testHost = new URL(process.env.DATABASE_URL).hostname;
  const isLocal = testHost === "localhost" || testHost === "127.0.0.1" || testHost === "::1";
  if (!isLocal && process.env.ALLOW_REMOTE_TEST_DB !== "true") {
    throw new Error(
      `Refusing to run tests against non-local database host "${testHost}". ` +
      `Point TEST_DATABASE_URL at a local/Docker test DB (e.g. the port-5434 container), ` +
      `or set ALLOW_REMOTE_TEST_DB=true to override deliberately.`
    );
  }
}
// Increase hook timeout for slow migrations globally
vi.setConfig({ hookTimeout: 300000 });
// Mock browser APIs for JSDOM environment (UI tests)
if (typeof window !== 'undefined') {
  // Mock window.navigator
  Object.defineProperty(window, 'navigator', {
    value: {
      userAgent: 'test-user-agent',
      language: 'en-US',
      languages: ['en-US', 'en'],
      onLine: true,
      platform: 'test',
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(''),
      },
    },
    writable: true,
    configurable: true,
  });
  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => { return ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    root: null,
    rootMargin: '',
    thresholds: [],
    takeRecords: vi.fn().mockReturnValue([]),
  }); });
  // Mock ResizeObserver
  global.ResizeObserver = class ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  } as any;
  // Mock matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
// Helper to check if we should connect to real DB
const shouldConnectToDb = () => {
  // Check if we are running in a unit test file context
  try {
    const state = expect.getState();
    const testPath = state.testPath || state.currentTestName;
    // Only skip DB for pure unit tests (components, hooks, utils)
    // Service tests in tests/unit often use the DB (integration tests in disguise)

    if (testPath && (
      testPath.includes('/unit/components/') ||
      testPath.includes('\\unit\\components\\') ||
      testPath.includes('/unit/hooks/') ||
      testPath.includes('\\unit\\hooks\\') ||
      testPath.includes('/unit/utils/') ||
      testPath.includes('\\unit\\utils\\')
    )) {
      console.log(`ℹ️  Skipping DB connection for component/hook/util unit test: ${testPath}`);
      return false;
    }
  } catch (e) {
    // expect.getState() might fail if not in test context, ignore
  }

  // Don't connect if we are explicitly in unit tests (which interpret "db" as a mock)
  // or if NO database URL was provided at all
  if (process.env.TEST_TYPE === 'unit') { return false; }
  // If we are in unit tests generally (inferred), try to avoid heavy DB unless forced
  return !!process.env.DATABASE_URL;
};
// Global test hooks
beforeAll(async () => {
  // Conditionally load jest-dom for UI tests (JSDOM environment)
  if (typeof window !== 'undefined') {
    try {

      // @ts-expect-error - types for jest-dom might be missing in this context
      await import("@testing-library/jest-dom");
    } catch (e) {
      console.warn("Failed to load jest-dom:", e);
    }
  }
  // Only attempt DB setup if we expect a real DB connection
  if (shouldConnectToDb()) {
    try {
      // PARALLELISM: Create isolated schema for this worker
      // We must do this BEFORE importing server/db so that the pool connects to the correct schema
      // PARALLELISM: Create isolated schema for this worker
      // We must do this BEFORE importing server/db so that the pool connects to the correct schema
      // Default to isolation if we are connecting to DB
      // eslint-disable-next-line sonarjs/no-gratuitous-expressions, no-constant-condition
      if (true) {
        // Save original URL for teardown
        (global as any).__BASE_DB_URL__ = process.env.DATABASE_URL;
        const { schemaName, connectionString, existed } = await SchemaManager.createTestSchema(process.env.DATABASE_URL!);
        process.env.DATABASE_URL = connectionString;
        // Set TEST_SCHEMA in both global and env so db.ts can configure the pool correctly
        (global as any).__TEST_SCHEMA__ = schemaName;
        process.env.TEST_SCHEMA = schemaName;
        console.log(`🔒 Test Schema Isolated: ${schemaName} (Reused: ${existed})`);
        // Check if we need to run migrations
        // If schema exists, verify it has tables before skipping migrations
        if (existed) {
          try {
            const { Client } = await import('pg');
            const checkClient = new Client({ connectionString: process.env.DATABASE_URL });
            await checkClient.connect();
            const tableCheck = await checkClient.query(
              `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
              [schemaName]
            );
            await checkClient.end();
            const hasTable = parseInt(tableCheck.rows[0].cnt) > 0;
            (global as any).__SKIP_MIGRATIONS__ = hasTable;
            console.log(`📊 Schema ${schemaName} has ${tableCheck.rows[0].cnt} tables - ${hasTable ? 'skipping' : 'running'} migrations`);
          } catch (e) {
            console.warn(`⚠️ Could not check table count, will run migrations:`, e);
            (global as any).__SKIP_MIGRATIONS__ = false;
          }
        } else {
          (global as any).__SKIP_MIGRATIONS__ = false;
        }
      }
      // Dynamically import server/db to ensure it picks up the mutated env vars
      const dbModule = await import("../server/db");
      // Check if the module is valid (not a partial mock missing exports)
      // Use 'in' check to avoid accessing undefined properties on strict mocks
      if ('db' in dbModule && 'initializeDatabase' in dbModule && dbModule.db && dbModule.initializeDatabase) {
        db = dbModule.db;
        initializeDatabase = dbModule.initializeDatabase;
        dbInitPromise = dbModule.dbInitPromise;
        // Initialize DB if not already initialized (idempotent - no-op after first call per fork)
        // We intentionally do NOT close the pool between test files to avoid "pool already ended" errors.
        await initializeDatabase();
        await dbInitPromise;
        // CRITICAL: For test schemas, set search_path at the CONNECTION LEVEL (not session level)
        // This ensures ALL subsequent queries use the correct schema
        if ((global as any).__TEST_SCHEMA__) {
          const schema = (global as any).__TEST_SCHEMA__;
          // Set search_path for the current connection
          await db.execute(`SET search_path TO "${schema}", public`);
          // NOTE: We intentionally do NOT use ALTER DATABASE SET search_path here.
          // When multiple test forks run in parallel, they all share the same database
          // and would race to set the database-level default, causing cross-fork interference.
          // Instead, we rely on the pool.connect() wrapper in server/db.ts which sets
          // search_path on every connection checkout, guaranteeing fork isolation.
          console.log(`✅ Enforced search_path: ${schema}, public`);
        }
        // pgcrypto provides digest() (used by portal token hashing and some
        // migrations). Create it in public — which is on the search_path — before
        // migrations run so digest() resolves in the isolated test schemas.
        try {
          await db.execute(`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public`);
        } catch (e: any) {
          console.warn(`⚠️ Could not ensure pgcrypto extension: ${e?.message}`);
        }
        try {
          await db.execute(`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public`);
          try {
            await db.execute(`ALTER EXTENSION pg_trgm SET SCHEMA public`);
          } catch {
            // benign if already in public
          }
        } catch (e: any) {
          console.warn(`⚠️ Could not ensure pg_trgm extension: ${e?.message}`);
        }
        // Run database migrations for test DB
        await applyManualMigrations(db);
        // CLEAN DATA when reusing schemas to prevent stale FK violations
        // (Schema structure is preserved, only data is cleared)
        if ((global as any).__SKIP_MIGRATIONS__) {
          try {
            await db.execute(`
              DO $$ DECLARE r RECORD;
              BEGIN
                FOR r IN (SELECT tablename FROM pg_tables
                          WHERE schemaname = current_schema()
                          AND tablename NOT LIKE '__drizzle%')
                LOOP
                  EXECUTE format('TRUNCATE TABLE %I.%I CASCADE', current_schema(), r.tablename);
                END LOOP;
              END $$;
            `);
            console.log('🧹 Truncated stale data from reused schema');
          } catch (truncErr: any) {
            console.warn(`⚠️ Failed to truncate stale data: ${truncErr.message}`);
          }
        }
        // NOTE: The former "failsafe" ADD COLUMN block and ensureDbFunctions()
        // were removed once the migration chain was regenerated to build the full
        // schema from scratch (0000_init_baseline) plus RLS (0001) and the
        // DataVault functions (0002). Fresh per-worker schemas now get everything
        // from the migrations alone — if something is missing, the migration is
        // wrong and tests should fail loudly rather than be papered over here.
      } else {
        console.log("⚠️ DB module loaded but appears to be a mock. Skipping real DB setup.");
      }
    } catch (error) {
      console.warn("⚠️ Database initialization failed (ignoring for unit tests or mock scenarios):", error);
    }
  }
});
afterAll(async () => {
  // OPTIMIZATION: Do NOT close the database pool or drop the schema here!
  // We want to reuse both the pool and schema for the next test file running in this same worker.
  // The fork process will clean up the pool when it exits.
  // Closing the pool here causes "Called end on pool more than once" errors when the next
  // test file's beforeAll tries to re-initialize, which aborts DB setup entirely.
  console.log("🧹 Cleaning up test environment...");
});
beforeEach(async () => {
  // Reset mocks before each test
  vi.clearAllMocks();
  // Clear shared state
  // We do NOT run ensureDbFunctions here anymore to reduce "tuple concurrently updated" errors.
  // It is sufficient to run it in beforeAll.
});
afterEach(async () => {
  vi.restoreAllMocks();
});
// Helper to apply manual migrations
async function applyManualMigrations(db: any) {
  // Wrap in try-catch so failing migrations (e.g. existing tables) don't block function creation
  try {
    if ((global as any).__SKIP_MIGRATIONS__) {
      console.log("⏩ Schema reused, skipping migrations.");
    } else {
      console.log("🔄 Running test migrations (manual file mode due to broken journal)...");
      const fs = await import('fs');
      const path = await import('path');
      const migrationsDir = path.join(process.cwd(), 'migrations');
      if (fs.existsSync(migrationsDir)) {
        console.error(`Debug: migrationsDir found: ${migrationsDir}`);
        const files = fs.readdirSync(migrationsDir)
          .filter(f => f.endsWith('.sql'))
          .sort(); // Alphanumeric sort
        console.error(`Debug: Found ${files.length} migration files`);
        console.error(`Debug: Files: ${files.join(', ')}`);
        for (const file of files) {
          console.log(`   Applying ${file}...`);
          let sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
          // CRITICAL: Ensure migrations run in the correct schema
          const schema = (global as any).__TEST_SCHEMA__;
          if (schema) {
            // Replace all hardcoded "public". schema references with test schema
            // This is essential because migrations contain CREATE TYPE "public"."type_name" statements
            sqlContent = sqlContent.replace(/"public"\./g, `"${schema}".`);
            // Prepend SET search_path to ensure all tables are created in test schema
            sqlContent = `SET search_path TO "${schema}", public;\n\n${sqlContent}`;
          }
          try {
            // OPTIMIZATION: Try to execute the whole file first
            await db.execute(sqlContent);
          } catch (e: any) {
            // If whole file execution fails with a benign error, fall back to statement-by-statement
            // Check for:
            // - 'already exists' string
            // - 'duplicate object' string
            // - code 42710 (duplicate_object) - for types/tables
            // - code 42P07 (duplicate_table)
            if (
              e.message.includes('already exists') ||
              e.message.includes('duplicate object') ||
              e.code === '42710' ||
              e.code === '42P07'
            ) {
              console.log(`⚠️ Partial failure in ${file} (Error: ${e.message} / Code: ${e.code}), retrying statement-by-statement...`);
              const statements = sqlContent.split('--> statement-breakpoint');
              for (const statement of statements) {
                if (!statement.trim()) { continue; }
                try {
                  // CRITICAL: Ensure each statement has the search_path set
                  // When statements are executed individually, we need to set search_path for each one
                  const schema = (global as any).__TEST_SCHEMA__;
                  let stmtWithPath = statement;
                  if (schema && !statement.includes('SET search_path')) {
                    stmtWithPath = `SET search_path TO "${schema}", public;\n${statement}`;
                  }
                  await db.execute(stmtWithPath);
                } catch (subError: any) {
                  if (
                    subError.message.includes('already exists') ||
                    subError.message.includes('duplicate object') ||
                    subError.code === '42710' ||
                    subError.code === '42P07'
                  ) {
                    // benign, ignore
                  } else {
                    console.error(`❌ FAILED MIGRATION ${file} STATEMENT:`, subError.message);
                    console.error(`SQL: ${statement.substring(0, 200)}...`); // Log start of SQL
                    throw subError;
                  }
                }
              }
            } else {
              console.error(`❌ FAILED MIGRATION ${file}:`, e.message);
              throw e;
            }
          }
        }
        console.log(`✅ Applied ${files.length} migration files.`);
      }
    }
  } catch (error: any) {
    console.warn("⚠️ Migrations failed (non-fatal if DB exists):", error);
  }
}

// Mock express-session only for unit tests (integration tests need real sessions)
const isIntegrationTest = process.env.TEST_TYPE === "integration" || process.env.VITEST_INTEGRATION === "true";
vi.mock('express-session', async () => {
  // Check if running integration tests
  if (process.env.TEST_TYPE === "integration" || process.env.VITEST_INTEGRATION === "true") {
    // Return actual express-session for integration tests
    return vi.importActual('express-session');
  }
  // Return mock for unit tests
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createMockSessionMiddleware } = require('./helpers/authMocks');
  return {
    default: vi.fn(() => createMockSessionMiddleware()),
  };
});
// Mock external services
vi.mock("../server/services/sendgrid", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  sendInvitation: vi.fn().mockResolvedValue({ success: true }),
  sendReminder: vi.fn().mockResolvedValue({ success: true }),
}));
// Mock database storage operations for tests
// Mock database storage operations for tests
// Storage mock removed (legacy system cleanup) - Use UserRepository directly
if (isIntegrationTest) {
  vi.setConfig({ testTimeout: 60000 });
}
// Mock AI Providers Globally to prevent rate limits and network calls
vi.mock("@google/generative-ai", () => {
  // Must be a real class: services call `new GoogleGenerativeAI(...)`, and an
  // arrow-function `vi.fn().mockImplementation(() => …)` is not a constructor,
  // which makes the AI-service singleton throw at import time (empty responses).
  class MockGoogleGenerativeAI {
    getGenerativeModel() {
      return {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              updatedWorkflow: { title: "Mocked AI Workflow", sections: [] },
              explanation: ["Mocked explanation"],
              diff: { changes: [] },
              suggestions: [],
            }),
          },
        }),
      };
    }
  }
  return {
    GoogleGenerativeAI: MockGoogleGenerativeAI,
  };
});
vi.mock("openai", () => {
  const MockOpenAI = vi.fn().mockImplementation(() => { return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "{}" } }],
          usage: { total_tokens: 10 },
        }),
      },
    },
  }; });
  return {
    'OpenAI': MockOpenAI,
    default: MockOpenAI,
  };
});
vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn().mockImplementation(() => { return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ text: "{}" }],
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    },
  }; });
  return {

    'Anthropic': MockAnthropic,
    default: MockAnthropic,
  };
});
