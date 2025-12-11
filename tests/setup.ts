import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";

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
      // This prevents crashing unit tests that partially mock server/db without exporting 'db' or 'initializeDatabase'
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
        console.log("🔄 Running test migrations...");
        await migrate(db, { migrationsFolder: "./migrations" });

        // Ensure DB functions exist (with concurrency retry)
        await ensureDbFunctionsWithRetry();

        // Verify what exists now (debug)
        /*
        const funcList = await db.execute(`
           SELECT specific_schema, routine_name, data_type 
           FROM information_schema.routines 
           WHERE routine_name = 'datavault_get_next_autonumber'
        `);
        console.log("🔎 Found functions:", JSON.stringify(funcList.rows));
        */
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
        BEGIN
          -- Generate a unique sequence name
          v_sequence_name := 'seq_' || replace(p_tenant_id::text, '-', '_') || '_' || replace(p_column_id::text, '-', '_');
          
          -- Handle Year-based updates
          IF p_format = 'YYYY' THEN
              v_year := to_char(current_date, 'YYYY');
              v_sequence_name := v_sequence_name || '_' || v_year;
          END IF;

          -- Create sequence if not exists
          EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', v_sequence_name);
          
          -- Get next value
          EXECUTE format('SELECT nextval(%L)', v_sequence_name) INTO v_next_val;
          
          -- Format the number
          v_formatted := lpad(v_next_val::text, p_min_digits, '0');
          
          -- Combine
          IF p_format = 'YYYY' THEN
               v_final_result := p_prefix || v_year || '-' || v_formatted;
          ELSE
               v_final_result := p_prefix || v_formatted;
          END IF;
          
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
            FOR r IN SELECT sequence_name FROM information_schema.sequences 
                     WHERE sequence_name LIKE 'seq_%_' || replace(p_column_id::text, '-', '_') || '%'
            LOOP
                EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.sequence_name);
            END LOOP;
        END;
        $$;
      `);

  // Legacy name support if needed (alias)
  await db.execute(`
        CREATE OR REPLACE FUNCTION public.datavault_get_next_auto_number(
          p_tenant_id UUID,
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
