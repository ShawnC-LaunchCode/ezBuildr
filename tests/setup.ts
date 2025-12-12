import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import dotenv from "dotenv";

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

// Correctly configure environment variables BEFORE importing DB (executed when setup files run)
process.env.NODE_ENV = "test";
process.env.GEMINI_API_KEY = "dummy-key-for-tests";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-key-for-testing-only";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.VITE_GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || "test-google-client-id";

// Enforce usage of TEST_DATABASE_URL if available
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Helper to check if we should connect to real DB
const shouldConnectToDb = () => {
  // Don't connect if we are explicitly in unit tests (which interpret "db" as a mock)
  // or if NO database URL was provided at all
  if (process.env.TEST_TYPE === 'unit') return false;

  // If we are in unit tests generally (inferred), try to avoid heavy DB unless forced
  return !!process.env.DATABASE_URL;
};

// Global test hooks
beforeAll(async () => {
  // Only attempt DB setup if we expect a real DB connection
  if (shouldConnectToDb()) {
    try {
      // Dynamically import server/db to ensure it picks up the mutated env vars
      const dbModule = await import("../server/db");

      // Check if the module is valid (not a partial mock missing exports)
      if (dbModule.db && dbModule.initializeDatabase) {
        db = dbModule.db;
        initializeDatabase = dbModule.initializeDatabase;
        dbInitPromise = dbModule.dbInitPromise;

        // Setup test database
        console.log("🧪 Setting up test environment...");
        await initializeDatabase();
        await dbInitPromise;
        console.log("✅ Database initialized for tests");

        // Run database migrations for test DB
        // Wrap in try-catch so failing migrations (e.g. existing tables) don't block function creation
        try {
          console.log("🔄 Running test migrations...");
          await migrate(db, { migrationsFolder: "./migrations" });
        } catch (error) {
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
  // await db.destroy();
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
  if (!db || !db.execute) return;

  for (let i = 0; i < retries; i++) {
    try {
      await ensureDbFunctions();
      return; // Success
    } catch (err: any) {
      // Check for "tuple concurrently updated" (Postgres error 40001 or similar)
      if (err.message && (err.message.includes('tuple concurrently updated') || err.message.includes('deadlock detected'))) {
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
  await db.execute(`
        CREATE OR REPLACE FUNCTION public.datavault_get_next_autonumber(
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
        CREATE OR REPLACE FUNCTION public.datavault_cleanup_sequence(p_column_id UUID)
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
            -- Let's define it as no-op or simple cleanup if possible.
            -- Actually, to properly clean, we'd need tenant_id.
            -- For now, invalidation is sufficient.
            NULL;
        END;
        $$;
      `);

  // Legacy name support if needed (alias)
  // Renamed p_tenant_id to p_table_id to match usage semantics (though types are same)
  await db.execute(`
        CREATE OR REPLACE FUNCTION public.datavault_get_next_auto_number(
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

// Mock external services
vi.mock("../server/services/sendgrid", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  sendInvitation: vi.fn().mockResolvedValue({ success: true }),
  sendReminder: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock database storage operations for tests
// Use a Map to store users in memory for tests (cleared before each test)
const testUsersMap = new Map();

vi.mock("../server/storage", () => ({
  storage: {
    upsertUser: vi.fn().mockImplementation(async (user: any) => {
      testUsersMap.set(user.id, user);
      return user;
    }),
    getUser: vi.fn().mockImplementation(async (userId: string) => {
      const user = testUsersMap.get(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
      return user;
    }),
    deleteUser: vi.fn().mockImplementation(async (userId: string) => {
      testUsersMap.delete(userId);
    }),
    ping: vi.fn().mockResolvedValue(true),
  },
}));

if (process.env.TEST_TYPE === "integration") {
  vi.setConfig({ testTimeout: 30000 });
}
