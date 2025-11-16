import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

/**
 * Global test setup file
 * Runs before all tests
 */

// Mock environment variables for tests
process.env.NODE_ENV = "test";
// Only override DATABASE_URL if not already set (e.g., in CI with Neon database)
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "postgresql://test:test@localhost:5432/vault_logic_test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-key-for-testing-only";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.VITE_GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || "test-google-client-id";

// Global test hooks
beforeAll(async () => {
  // Setup test database
  console.log("🧪 Setting up test environment...");

  // TODO: Run database migrations for test DB
  // await db.migrate.latest();
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

  // TODO: Clear test database tables
  // await clearDatabase();
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
// Use a Map to store users in memory for tests
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
