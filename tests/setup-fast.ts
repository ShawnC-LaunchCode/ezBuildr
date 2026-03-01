/**
 * Fast Test Setup - No Database
 *
 * Minimal setup for unit tests that mock all dependencies.
 * Contains only environment variables and module mocks.
 * NO database connection, schema management, or migrations.
 *
 * Used by the "unit-fast" vitest project for 85+ test files
 * that don't need a real database.
 */
import { beforeEach, afterEach, vi } from "vitest";

// Environment variable defaults
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.VITE_GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars-long";
process.env.VL_MASTER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
process.env.NODE_ENV = "test";

// Load jest-dom matchers for JSDOM environment (UI tests)
if (typeof window !== 'undefined') {
  try {
    // @ts-expect-error - types for jest-dom might be missing in this context
    await import("@testing-library/jest-dom");
  } catch {
    // jest-dom not available, skip
  }
}

// Mock browser APIs for JSDOM environment (UI tests)
if (typeof window !== 'undefined') {
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

  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    root: null,
    rootMargin: '',
    thresholds: [],
    takeRecords: vi.fn().mockReturnValue([]),
  }));

  global.ResizeObserver = class ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  } as any;

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

// Global test hooks
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Mock express-session
vi.mock('express-session', async () => {
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

// Mock AI Providers
vi.mock("@google/generative-ai", () => {
  const MockGoogleGenerativeAI = vi.fn().mockImplementation(() => { return {
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
  }; });
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
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'Anthropic': MockAnthropic,
    default: MockAnthropic,
  };
});
