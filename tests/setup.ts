import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { dbInitPromise, initializeDatabase, db } from "../server/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/**
 * Global test setup file
 * Runs before all tests
 */

// Mock environment variables for tests
process.env.NODE_ENV = "test";
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
      console.log("✅ Test migrations applied");
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
// Mock file upload - multer is a CommonJS module
vi.mock("multer", () => {
  const multer: any = (options?: any) => ({
    single: () => (req: any, res: any, next: any) => next(),
    array: () => (req: any, res: any, next: any) => next(),
    fields: () => (req: any, res: any, next: any) => next(),
  });

  // Add diskStorage method
  multer.diskStorage = (options: any) => ({
    _handleFile: (req: any, file: any, cb: any) => cb(null, { path: '/tmp/test-file', size: 0 }),
    _removeFile: (req: any, file: any, cb: any) => cb(null),
  });

  // Add memoryStorage method
  multer.memoryStorage = () => ({
    _handleFile: (req: any, file: any, cb: any) => cb(null, { buffer: Buffer.from('test'), size: 4 }),
    _removeFile: (req: any, file: any, cb: any) => cb(null),
  });

  // Set default export
  multer.default = multer;

  return { default: multer };
});
if (process.env.TEST_TYPE === "integration") {
  vi.setConfig({ testTimeout: 30000 });
}
