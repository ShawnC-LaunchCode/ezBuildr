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

  // Regression: the link was built from `NODE_ENV === 'production' ?
  // 'https://www.ezbuildr.com' : ...`. dev and test are production BUILDS on
  // non-production Railway environments, so they satisfy that branch and mailed
  // recipients of a dev invite to the live site, ignoring BASE_URL entirely.
  it('links to the configured base URL, not the live domain, on a non-production deployment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BASE_URL', 'https://ezbuildr-prod-dev.up.railway.app');

    await sendSystemInviteEmail('invitee@example.com', 'setup-token', 'creator');

    const [, , html] = addToQueue.mock.calls[0] as [string, string, string];
    expect(html).toContain('https://ezbuildr-prod-dev.up.railway.app/auth/reset-password');
    expect(html).not.toContain('www.ezbuildr.com');

    vi.unstubAllEnvs();
  });
});
