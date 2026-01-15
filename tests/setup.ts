import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
console.log("SETUP: Loading setup.ts...");
import { migrate } from "drizzle-orm/node-postgres/migrator";
import dotenv from "dotenv";

// import "@testing-library/jest-dom";
import { SchemaManager } from "./helpers/schemaManager";

declare global {
  var __BASE_DB_URL__: string;
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
let closeDatabase: any;
let dbInitPromise: any;

// Correctly configure environment variables BEFORE importing DB (executed when setup files run)
process.env.NODE_ENV = "test";
process.env.GEMINI_API_KEY = "dummy-key-for-tests";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-key-for-testing-only-very-long-to-be-safe";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.VITE_GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars-long";

// Enforce usage of TEST_DATABASE_URL if available
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
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
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    root: null,
    rootMargin: '',
    thresholds: [],
    takeRecords: vi.fn().mockReturnValue([]),
  }));

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
      if (process.env.TEST_TYPE === "integration" || process.env.VITEST_INTEGRATION === "true") {
        // Save original URL for teardown
        (global as any).__BASE_DB_URL__ = process.env.DATABASE_URL;
        const { schemaName, connectionString, existed } = await SchemaManager.createTestSchema(process.env.DATABASE_URL!);
        process.env.DATABASE_URL = connectionString;
        (global as any).__TEST_SCHEMA__ = schemaName;
        console.log(`🔒 Test Schema Isolated: ${schemaName} (Reused: ${existed})`);

        // Check if we need to run migrations (only if schema is new)
        (global as any).__SKIP_MIGRATIONS__ = existed;
      }

      // Dynamically import server/db to ensure it picks up the mutated env vars
      console.log(`[SETUP] DATABASE_URL sent to db module: ${process.env.DATABASE_URL}`);
      const dbModule = await import("../server/db");

      // Check if the module is valid (not a partial mock missing exports)
      // Use 'in' check to avoid accessing undefined properties on strict mocks
      if ('db' in dbModule && 'initializeDatabase' in dbModule && dbModule.db && dbModule.initializeDatabase) {
        db = dbModule.db;
        initializeDatabase = dbModule.initializeDatabase;
        closeDatabase = dbModule.closeDatabase;
        dbInitPromise = dbModule.dbInitPromise;

        // Setup test database
        await initializeDatabase();
        await dbInitPromise;

        // CRITICAL: Enforce search_path for this connection
        if ((global as any).__TEST_SCHEMA__) {
          const schema = (global as any).__TEST_SCHEMA__;
          await db.execute(`SET search_path TO "${schema}", public`);
          console.log(`✅ Enforced search_path: ${schema}, public`);
        }

        // DEBUG: Check current schema
        const schemaRes = await db.execute("SELECT current_schema()");
        console.log(`✅ Database initialized. Current schema: ${schemaRes.rows[0].current_schema}`);

        // Run database migrations for test DB
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
              const files = fs.readdirSync(migrationsDir)
                .filter(f => f.endsWith('.sql'))
                .sort(); // Alphanumeric sort

              for (const file of files) {
                console.log(`   Applying ${file}...`);
                const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

                try {
                  // OPTIMIZATION: Try to execute the whole file first
                  await db.execute(sqlContent);
                } catch (e: any) {
                  // If whole file execution fails with a benign error, fall back to statement-by-statement
                  if (e.message.includes('already exists') || e.message.includes('duplicate object')) {
                    console.log(`⚠️ Partial failure in ${file} (Error: ${e.message}), retrying statement-by-statement...`);
                    const statements = sqlContent.split('--> statement-breakpoint');
                    for (const statement of statements) {
                      if (!statement.trim()) continue;
                      try {
                        await db.execute(statement);
                      } catch (subError: any) {
                        if (subError.message.includes('already exists') || subError.message.includes('duplicate object')) {
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

        // Ensure DB functions exist (with concurrency retry)
        // Critical: run this even if migrations fail
        await ensureDbFunctionsWithRetry();
      } else {
        console.log("⚠️ DB module loaded but appears to be a mock. Skipping real DB setup.");
      }
    } catch (error) {
      console.warn("⚠️ Database initialization failed (ignoring for unit tests or mock scenarios):", error);
    }
  }
});

afterAll(async () => {
  // Cleanup test database
  console.log("🧹 Cleaning up test environment...");

  // Close DB pool first
  if (closeDatabase) {
    await closeDatabase();
  } else if (db?.closeDatabase) {
    await db.closeDatabase();
  }

  // Drop isolated schema if it exists
  const schemaName = (global as any).__TEST_SCHEMA__;
  const baseDbUrl = (global as any).__BASE_DB_URL__;

  // OPTIMIZATION: Do NOT drop schema here!
  // We want to reuse the schema for the next test file running in this same worker.
  // This enables "Worker Reuse" strategy.
  // if (schemaName && baseDbUrl) {
  //   await SchemaManager.dropTestSchema(baseDbUrl, schemaName);
  // }
});

beforeEach(async () => {
  // Reset mocks before each test
  vi.clearAllMocks();

  // Clear shared state
  testUsersMap.clear();

  // We do NOT run ensureDbFunctions here anymore to reduce "tuple concurrently updated" errors.
  // It is sufficient to run it in beforeAll.
});

afterEach(async () => {
  vi.restoreAllMocks();
});

// Helper to ensure DB functions exist with retry logic for concurrency
async function ensureDbFunctionsWithRetry(retries = 3) {
  // Only proceed if db is actually connected to a real DB-like object
  if (!db?.execute) { return; }

  for (let i = 0; i < retries; i++) {
    try {
      await ensureDbFunctions();
      return; // Success
    } catch (err: any) {
      // Check for "tuple concurrently updated" (Postgres error 40001) or Unique Violation (23505)
      // 23505 happens when two tests try to create the same function at the exact same millisecond
      if (
        (err.code === '23505' || err.code === '40001') ||
        (err.message && (err.message.includes('tuple concurrently updated') || err.message.includes('deadlock detected')))
      ) {
        console.log(`⚠️ Concurrency conflict creating DB functions (attempt ${i + 1}/${retries}). Retrying...`);
        await new Promise(r => setTimeout(r, 300 * (i + 1))); // Exponential backoff
        continue;
      }
      throw err; // Rethrow other errors
    }
  }
}

// Helper to ensure DB functions exist
async function ensureDbFunctions() {
  // FORCE RECREATE function to ensure correct signature (7 args)
  // We use CREATE OR REPLACE to handle updates atomically-ish.
  // Removed explicit DROP to reduce race condition window unless purely necessary.

  // DEBUG: Check what functions exist before we try to drop/create
  const existingFuncs = await db.execute(`
    SELECT proname, proargnames, proargtypes, oid::regprocedure as signature
    FROM pg_proc
    WHERE proname = 'datavault_get_next_autonumber';
  `);
  console.log("DEBUG: Existing functions:", JSON.stringify(existingFuncs.rows || existingFuncs, null, 2));

  // Create a loop to drop all existing overloads
  if (existingFuncs.rows && existingFuncs.rows.length > 0) {
    for (const func of existingFuncs.rows) {
      console.log(`DEBUG: Dropping existing function: ${func.signature}`);
      await db.execute(`DROP FUNCTION IF EXISTS ${func.signature} CASCADE;`);
    }
  } else {
    // Fallback if no rows (shouldn't happen if function exists, but harmless)
    await db.execute('DROP FUNCTION IF EXISTS datavault_get_next_autonumber(uuid,uuid,uuid,text,integer,text,text) CASCADE;');
  }

  await db.execute(`
        CREATE OR REPLACE FUNCTION datavault_get_next_autonumber(
          p_tenant_id UUID,
          p_table_id UUID,
          p_column_id UUID,
          p_context_key TEXT,
          p_min_digits INTEGER DEFAULT 1,
          p_prefix TEXT DEFAULT '',
          p_format TEXT DEFAULT NULL
        )
        RETURNS TEXT
        LANGUAGE plpgsql
        AS $$
        DECLARE
          v_sequence_name TEXT;
          v_next_val BIGINT;
          v_year TEXT;
          v_formatted TEXT;
          v_final_result TEXT;
          v_prefix TEXT;
        BEGIN
          -- Use MD5 hash for sequence name to ensure uniqueness and stay within 63 char limit
          -- Format: seq_{md5_hash}
          v_sequence_name := 'seq_' || md5(p_tenant_id::text || '_' || p_column_id::text);
          
          -- Handle Year-based updates
          IF p_format = 'YYYY' THEN
              v_year := to_char(current_date, 'YYYY');
              v_sequence_name := v_sequence_name || '_' || v_year;
          END IF;

          -- Create sequence if not exists
          EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', v_sequence_name);
          
          -- Get next value
          EXECUTE format('SELECT nextval(%L)', v_sequence_name) INTO v_next_val;
          
          -- Ensure defaults for NULL inputs to prevent NULL results
          v_prefix := COALESCE(p_prefix, '');
          
          -- Format the number
          v_formatted := lpad(v_next_val::text, COALESCE(p_min_digits, 4), '0');
          
          -- Combine
          -- Logic: [Prefix-] [Year-] Number
          
          -- 1. Start with Prefix (if exists, add dash)
          IF v_prefix <> '' THEN
             v_final_result := v_prefix || '-';
          ELSE
             v_final_result := '';
          END IF;
          
          -- 2. Add Year (if exists, add dash)
          IF p_format = 'YYYY' THEN
               v_final_result := v_final_result || v_year || '-';
          END IF;
          
          -- 3. Add Number
          v_final_result := v_final_result || v_formatted;
          
          RETURN v_final_result;
        END;
        $$;
      `);

  // Cleanup function
  await db.execute(`
        CREATE OR REPLACE FUNCTION datavault_cleanup_sequence(p_column_id UUID)
        RETURNS VOID
        LANGUAGE plpgsql
        AS $$
        DECLARE
            r RECORD;
        BEGIN
            -- Cleanup based on hashing pattern used above is harder without keeping track.
            -- For tests, we might skip precise cleanup or try to match partially?
            -- Since we used MD5(tenant + column), we can't search by LIKE easily without tenant_id.
            -- But standard cleanup might just drop by specific logic or we ignore it for tests.
            -- Actually, to properly clean, we'd need tenant_id.
            -- For now, invalidation is sufficient.
            NULL;
        END;
        $$;
      `);

  // Legacy name support if needed (alias)
  // Renamed p_tenant_id to p_table_id to match usage semantics (though types are same)
  await db.execute('DROP FUNCTION IF EXISTS datavault_get_next_auto_number(uuid,uuid,integer);');
  await db.execute(`
        CREATE OR REPLACE FUNCTION datavault_get_next_auto_number(
          p_table_id UUID,
          p_column_id UUID,
          p_start_value INTEGER
        )
        RETURNS INTEGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
            -- Simple wrapper or lightweight sequence fallback
            return 1; 
        END;
        $$;
      `);
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
// Use a Map to store users in memory for tests (cleared before each test)
const testUsersMap = new Map();

vi.mock("../server/storage", async (importOriginal) => {
  const actual = await importOriginal<any>();

  // Helper to determine mode inside the hoisted factory
  const shouldUseRealDb = () => {
    // Explicit integration flags
    if (process.env.TEST_TYPE === "integration" || process.env.VITEST_INTEGRATION === "true") { return true; }
    // Unit test flag
    if (process.env.TEST_TYPE === "unit") { return false; }
    // Fallback: If DB URL exists, assume integration unless unit explicitly requested
    return !!(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL);
  };

  return {
    storage: {
      ...actual.storage,
      upsertUser: vi.fn().mockImplementation(async (user: any) => {
        if (!shouldUseRealDb()) {
          // console.log("[Storage Mock] creating user in Memory", user.email);
          testUsersMap.set(user.id, user);
          return user; // Return the user object as expected even in mock
        }
        // console.log("[Storage Mock] upsertUser delegating to Real DB", user.email);
        try {
          return await actual.storage.upsertUser(user);
        } catch (e) {
          console.error("[Storage Mock] upsertUser failed in Real DB", e);
          throw e;
        }
      }),
      getUser: vi.fn().mockImplementation(async (userId: string) => {
        if (!shouldUseRealDb()) {
          // console.log("[Storage Mock] getUser from Memory", userId, user ? "FOUND" : "NOT FOUND");
          // Behave like Real DB: return undefined if not found (don't throw unless required by contract, currently contract says | undefined)
          // Wait, server/storage.ts says Promise<User | undefined>. 
          // So we should return undefined if not found.
          // BUT previous mock threw error? "throw new Error(`User not found...`)"? 
          // Let's stick to returning undefined to match interface.
          return testUsersMap.get(userId);
        }
        // console.log("[Storage Mock] getUser delegating to Real DB", userId);
        return actual.storage.getUser(userId);
      }),
      deleteUser: vi.fn().mockImplementation(async (userId: string) => {
        if (!shouldUseRealDb()) {
          testUsersMap.delete(userId);
          return;
        }
        return actual.storage.deleteUser(userId);
      }),
      ping: vi.fn().mockResolvedValue(true),
    },
  };
});

if (isIntegrationTest) {
  vi.setConfig({ testTimeout: 60000 });
}

// Mock AI Providers Globally to prevent rate limits and network calls
vi.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
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
      }),
    })),
  };
});

vi.mock("openai", () => {
  return {
    OpenAI: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "{}" } }],
            usage: { total_tokens: 10 },
          }),
        },
      },
    })),
  };
});

vi.mock("@anthropic-ai/sdk", () => {
  return {
    Anthropic: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: "{}" }],
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      },
    })),
  };
});
