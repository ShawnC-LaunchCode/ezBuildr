import { describe, expect, it, vi } from 'vitest';

import { RunResumeService } from '../../../server/services/runs/RunResumeService';
import { hashToken } from '../../../server/utils/encryption';

const runId = '11111111-1111-4111-8111-111111111111';
const tenantId = '22222222-2222-4222-8222-222222222222';
const sectionId = '33333333-3333-4333-8333-333333333333';
const fixedNow = new Date('2026-08-06T12:00:00.000Z');
const resumeToken = 'a'.repeat(64);
const rotatedRunToken = '44444444-4444-4444-8444-444444444444';

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    workflowId: '55555555-5555-4555-8555-555555555555',
    currentSectionId: sectionId,
    completed: false,
    assignedToUserId: null,
    clientEmail: null,
    ...overrides,
  };
}

function makeService(options: {
  consumeResult?: unknown;
  resolvedRun?: unknown;
  staffAccessError?: Error;
} = {}) {
  const run = options.resolvedRun ?? makeRun();
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ tx: true }));
  const runRepo = {
    findById: vi.fn().mockResolvedValue(run),
    updateIfIncomplete: vi.fn().mockImplementation(async (_id: string, updates: Record<string, unknown>) => ({ ...run, ...updates })),
    revokeToken: vi.fn().mockResolvedValue(undefined),
  };
  const resumeRepo = {
    transaction,
    revokeActiveForRun: vi.fn().mockResolvedValue(undefined),
    revokeById: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockImplementation(async (data: Record<string, unknown>) => ({ id: 'link-1', ...data })),
    consumeActive: vi.fn().mockResolvedValue('consumeResult' in options ? options.consumeResult : {
      id: 'link-1',
      runId,
      tenantId,
      tokenHash: hashToken(resumeToken),
      recipientEmail: 'client@example.com',
      kind: 'save_resume',
    }),
  };
  const authResolver = {
    resolveRun: vi.fn().mockResolvedValue({ run, tenantId, access: 'owner', mode: 'live' }),
  };
  const auditService = { logRunEvent: vi.fn().mockResolvedValue({ id: 'audit-1' }) };
  const emailSender = vi.fn().mockResolvedValue(undefined);
  const staffAccessVerifier = options.staffAccessError
    ? vi.fn().mockRejectedValue(options.staffAccessError)
    : vi.fn().mockResolvedValue(undefined);
  const userRepo = { findById: vi.fn() };
  const service = new RunResumeService({
    runRepo: runRepo as never,
    resumeRepo: resumeRepo as never,
    userRepo: userRepo as never,
    authResolver: authResolver as never,
    auditService: auditService as never,
    emailSender,
    staffAccessVerifier,
    now: () => fixedNow,
    resumeTokenFactory: () => resumeToken,
    runTokenFactory: () => rotatedRunToken,
  });
  return {
    service,
    runRepo,
    resumeRepo,
    authResolver,
    auditService,
    emailSender,
    staffAccessVerifier,
    userRepo,
  };
}

describe('RunResumeService', () => {
  it('stores only a hash and honors the requested link expiry', async () => {
    const { service, resumeRepo, emailSender, auditService } = makeService();

    const result = await service.requestResumeLink({
      runId,
      email: 'Client@Example.com',
      expiryMinutes: 60,
      auth: { tokenRunId: runId },
    });

    expect(result.expiresAt).toEqual(new Date('2026-08-06T13:00:00.000Z'));
    expect(resumeRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: hashToken(resumeToken),
        recipientEmail: 'client@example.com',
        expiresAt: result.expiresAt,
      }),
      expect.anything(),
    );
    expect(JSON.stringify(resumeRepo.create.mock.calls)).not.toContain(resumeToken);
    expect(emailSender).toHaveBeenCalledWith(
      'client@example.com',
      expect.stringContaining(`resume=${resumeToken}`),
      result.expiresAt,
      'save_resume',
    );
    expect(auditService.logRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'run_resume_link_created' }),
      expect.anything(),
    );
  });

  it('rejects expired, revoked, invalid, or already-used credentials without rotating the run token', async () => {
    const { service, runRepo, auditService } = makeService({ consumeResult: null });

    await expect(service.redeemResumeLink({ runId, token: resumeToken }))
      .rejects.toMatchObject({ statusCode: 401, message: 'Resume link is invalid or expired' });

    expect(runRepo.updateIfIncomplete).not.toHaveBeenCalled();
    expect(auditService.logRunEvent).not.toHaveBeenCalled();
  });

  it('atomically consumes the link, rotates the bearer credential, and preserves the saved cursor', async () => {
    const { service, runRepo, resumeRepo, auditService } = makeService();

    const result = await service.redeemResumeLink({ runId, token: resumeToken });

    expect(resumeRepo.consumeActive).toHaveBeenCalledWith(
      runId,
      hashToken(resumeToken),
      fixedNow,
      expect.anything(),
    );
    expect(runRepo.updateIfIncomplete).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({ runToken: hashToken(rotatedRunToken) }),
      expect.anything(),
    );
    expect(result).toMatchObject({ runId, runToken: rotatedRunToken, currentSectionId: sectionId });
    expect(auditService.logRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'run_resume_link_accessed' }),
      expect.anything(),
    );
  });

  it('refuses to hand a run to a user from another tenant', async () => {
    const { service, runRepo, userRepo } = makeService();
    userRepo.findById.mockResolvedValue({
      id: 'outside-user',
      tenantId: 'outside-tenant',
      email: 'outside@example.com',
      isActive: true,
    });

    await expect(service.handoffRun({
      runId,
      assigneeUserId: 'outside-user',
      expiryMinutes: 60,
      auth: { userId: 'owner-1' },
    })).rejects.toMatchObject({ statusCode: 403 });

    expect(runRepo.updateIfIncomplete).not.toHaveBeenCalled();
  });

  it('requires workflow edit access before staff can hand off a run', async () => {
    const { service, runRepo, staffAccessVerifier } = makeService({
      staffAccessError: new Error('viewer only'),
    });

    await expect(service.handoffRun({
      runId,
      clientEmail: 'client@example.com',
      expiryMinutes: 60,
      auth: { userId: 'respondent-1' },
    })).rejects.toMatchObject({ statusCode: 403 });

    expect(staffAccessVerifier).toHaveBeenCalledWith(makeRun().workflowId, 'respondent-1');
    expect(runRepo.updateIfIncomplete).not.toHaveBeenCalled();
  });
});
