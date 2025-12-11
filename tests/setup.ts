import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { dbInitPromise, initializeDatabase, db } from "../server/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/**
 * Global test setup file
 * Runs before all tests
 */

// Mock environment variables for tests
process.env.NODE_ENV = "test";
process.env.GEMINI_API_KEY = "dummy-key-for-tests"; // Ensure services initialize with a key available
// Only set DATABASE_URL if explicitly provided (don't default to localhost)
// This allows database-dependent tests to be skipped via describeWithDb
if (!process.env.DATABASE_URL && process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-key-for-testing-only";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.VITE_GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || "test-google-client-id";

// Global test hooks
beforeAll(async () => {
  // Setup test database
  console.log("🧪 Setting up test environment...");

  // Wait for database initialization
  try {
    await initializeDatabase();
    await dbInitPromise;
    console.log("✅ Database initialized for tests");

    // Run database migrations for test DB to ensure functions like datavault_get_next_autonumber exist
    if (process.env.DATABASE_URL) {
      console.log("🔄 Running test migrations...");
      await migrate(db, { migrationsFolder: "./migrations" });
      // FORCE RECREATE function to ensure correct signature (7 args)
      // We drop it first to avoid signature mismatch errors if an old version exists
      await db.execute(`DROP FUNCTION IF EXISTS datavault_get_next_autonumber(uuid, uuid, uuid, text, integer, text, text);`);

      // Also drop the old 6-arg version if it exists to be safe
      await db.execute(`DROP FUNCTION IF EXISTS datavault_get_next_autonumber(uuid, uuid, uuid, text, integer, text);`);

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
      console.log("✅ Forced recreation of datavault_get_next_autonumber (7 args)");
    }
  } catch (error) {
    console.warn("⚠️ Database initialization/migration failed (this is expected if no DATABASE_URL is set):", error);
  }
});

afterAll(async () => {
  // Cleanup test database
  console.log("🧹 Cleaning up test environment...");

  // TODO: Teardown test database
  // await db.destroy();
});

beforeEach(async () => {
  // Reset mocks before each test
  vi.clearAllMocks();

  // Clear shared state to ensure test isolation
  testUsersMap.clear();

  // Note: For database cleanup, use runInTransaction() pattern
  // or TestFactory.cleanup() in individual test files
});

afterEach(async () => {
  // Cleanup after each test
  vi.restoreAllMocks();
});

// Mock external services
vi.mock("../server/services/sendgrid", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  sendInvitation: vi.fn().mockResolvedValue({ success: true }),
  sendReminder: vi.fn().mockResolvedValue({ success: true }),
}));

// Note: Google OAuth is mocked in individual test files for fine-grained control

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

// Mock file upload - multer is a CommonJS module
// (removed)

if (process.env.TEST_TYPE === "integration") {
  vi.setConfig({ testTimeout: 30000 });
}
