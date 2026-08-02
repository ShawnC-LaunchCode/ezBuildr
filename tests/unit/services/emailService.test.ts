import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addToQueue } = vi.hoisted(() => ({ addToQueue: vi.fn() }));

vi.mock('../../../server/services/EmailQueueService', () => ({
  emailQueueService: { addToQueue },
}));

import { sendSystemInviteEmail } from '../../../server/services/emailService';

describe('sendSystemInviteEmail', () => {
  beforeEach(() => {
    addToQueue.mockResolvedValue('email-job-id');
  });

  it('preserves a safe organization invitation through account setup', async () => {
    await sendSystemInviteEmail(
      'invitee@example.com',
      'setup-token',
      'creator',
      '/invites/invite-token/accept'
    );

    expect(addToQueue).toHaveBeenCalledOnce();
    const [, , html] = addToQueue.mock.calls[0] as [string, string, string];
    expect(html).toContain(
      'returnTo=%2Finvites%2Finvite-token%2Faccept'
    );
  });

  it('does not include an external return URL', async () => {
    await sendSystemInviteEmail(
      'invitee@example.com',
      'setup-token',
      'creator',
      '//evil.example'
    );

    const [, , html] = addToQueue.mock.calls[0] as [string, string, string];
    expect(html).not.toContain('returnTo=');
  });
});
