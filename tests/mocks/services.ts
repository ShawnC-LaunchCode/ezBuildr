import { vi } from 'vitest';

/**
 * Mock Factory for Services
 *
 * Provides factory functions to create mock implementations of services
 * with customizable behavior per-test.
 *
 * Usage:
 * ```typescript
 * import { mockSendgridService } from '../mocks/services';
 *
 * it('should send email', async () => {
 *   const sendgrid = mockSendgridService({
 *     sendEmail: vi.fn().mockResolvedValue({ success: true }),
 *   });
 *
 *   await myService.notify(sendgrid);
 *   expect(sendgrid.sendEmail).toHaveBeenCalledWith({...});
 * });
 * ```
 */

/**
 * Mock SendGrid service
 */
export function mockSendgridService(overrides = {}) {
  return {
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
    sendInvitation: vi.fn().mockResolvedValue({ success: true }),
    sendReminder: vi.fn().mockResolvedValue({ success: true }),
    sendPasswordReset: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

/**
 * Mock file service
 */
export function mockFileService(overrides = {}) {
  return {
    uploadFile: vi.fn().mockResolvedValue({
      id: 'file-123',
      filename: 'test.pdf',
      path: '/tmp/test.pdf',
      mimetype: 'application/pdf',
      size: 1024,
    }),
    deleteFile: vi.fn().mockResolvedValue(true),
    getFile: vi.fn().mockResolvedValue({
      id: 'file-123',
      filename: 'test.pdf',
      path: '/tmp/test.pdf',
    }),
    ...overrides,
  };
}

/**
 * Mock storage service
 */
export function mockStorageService(overrides = {}) {
  const userMap = new Map();

  return {
    upsertUser: vi.fn().mockImplementation(async (user: any) => {
      userMap.set(user.id, user);
      return user;
    }),
    getUser: vi.fn().mockImplementation(async (userId: string) => {
      const user = userMap.get(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
      return user;
    }),
    deleteUser: vi.fn().mockImplementation(async (userId: string) => {
      userMap.delete(userId);
    }),
    ping: vi.fn().mockResolvedValue(true),
    clear: () => userMap.clear(),
    ...overrides,
  };
}

/**
 * Mock AI service (Gemini)
 */
export function mockAIService(overrides = {}) {
  return {
    generateWorkflow: vi.fn().mockResolvedValue({
      title: 'AI Generated Workflow',
      pages: [],
      steps: [],
    }),
    suggestImprovements: vi.fn().mockResolvedValue({
      suggestions: [],
    }),
    analyzeTemplate: vi.fn().mockResolvedValue({
      variables: [],
    }),
    ...overrides,
  };
}

/**
 * Mock OAuth2 service
 */
export function mockOAuth2Service(overrides = {}) {
  return {
    getAccessToken: vi.fn().mockResolvedValue({
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    }),
    refreshAccessToken: vi.fn().mockResolvedValue({
      access_token: 'mock-refreshed-token',
      token_type: 'Bearer',
      expires_in: 3600,
    }),
    ...overrides,
  };
}

/**
 * Mock Logger
 */
export function mockLogger(overrides = {}) {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
    ...overrides,
  };
}
