import { describe, expect, it } from 'vitest';

import { getSafeReturnTo, withReturnTo } from '../../../client/src/lib/authRedirect';

describe('authRedirect', () => {
  it('preserves an organization invitation path', () => {
    const invitePath = '/invites/abc123/accept';
    const loginUrl = withReturnTo('/auth/login', invitePath);

    expect(loginUrl).toBe('/auth/login?returnTo=%2Finvites%2Fabc123%2Faccept');
    expect(getSafeReturnTo(loginUrl.slice(loginUrl.indexOf('?')))).toBe(invitePath);
  });

  it.each([
    '?returnTo=https%3A%2F%2Fevil.example',
    '?returnTo=%2F%2Fevil.example',
    '?returnTo=%2F%5Cevil.example',
  ])('rejects a non-local return path: %s', (search) => {
    expect(getSafeReturnTo(search)).toBeNull();
  });
});
