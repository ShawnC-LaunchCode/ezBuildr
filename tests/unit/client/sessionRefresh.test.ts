// @vitest-environment jsdom
/**
 * The refresh-token race, reproduced in a browser on 2026-09-14.
 *
 * The refresh token rotates, and the server treats a used token coming back as
 * theft: it revokes every session the user has. After an idle builder session
 * one in-app navigation fired three requests; all three 401'd, each sent its own
 * refresh with the same cookie, the first rotated it, the other two presented the
 * now-revoked token, and the user was signed out on every device.
 *
 * `fakeAuthServer` models exactly those server rules — rotation on success,
 * revoke-everything on reuse, a cookie jar the browser shares across tabs — so a
 * test passes only if the client never sends two refreshes with the same cookie.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const VAULT_API = '../../../client/src/lib/vault-api';
const SESSION_REFRESH = '../../../client/src/lib/sessionRefresh';

const tick = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });
const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeAuthServer() {
  const state = { cookie: 'c0', valid: 'c0', seq: 0, refreshCalls: 0, revokedEverything: false };
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith('/api/auth/refresh-token')) {
      state.refreshCalls++;
      const presented = state.cookie; // the browser attaches the cookie as the request leaves
      await tick(5);                  // server round trip: lets concurrent refreshes overlap
      if (state.revokedEverything || presented !== state.valid) {
        state.revokedEverything = true; // AuthService.rotateRefreshToken: reuse revokes all sessions
        return json({ message: 'Invalid refresh token' }, 401);
      }
      state.seq++;
      state.valid = `c${state.seq}`;
      state.cookie = state.valid;       // Set-Cookie — shared by every tab
      return json({ token: `t${state.seq}`, user: { id: 'u1' } }, 200);
    }
    await tick(1);
    const authorization = new Headers(init?.headers).get('Authorization');
    return state.seq > 0 && authorization === `Bearer t${state.seq}`
      ? json({ url }, 200)
      : json({ message: 'Unauthorized' }, 401);
  });
  return { state, fetch };
}

/** Web Locks, reduced to what the client uses: a FIFO mutex per page. */
function fakeLockManager(): { request: (name: string, run: () => Promise<unknown>) => Promise<unknown> } {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request: (_name, run) => {
      const result = tail.then(run);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

describe('session refresh (never two refreshes with the same cookie)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('three concurrent 401s send ONE refresh, and all three requests recover', async () => {
    const server = fakeAuthServer();
    vi.stubGlobal('fetch', server.fetch);
    const { fetchAPI, setAccessToken } = await import(VAULT_API);
    setAccessToken('t-expired');

    // The exact trio from the production log.
    const results = await Promise.allSettled([
      fetchAPI('/api/workflows/unfiled'),
      fetchAPI('/api/projects?limit=100'),
      fetchAPI('/api/organizations'),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    expect(server.state.refreshCalls).toBe(1);
    expect(server.state.revokedEverything).toBe(false);
  });

  it("useAuth's silent refresh and a 401 retry share one refresh", async () => {
    const server = fakeAuthServer();
    vi.stubGlobal('fetch', server.fetch);
    const { refreshSession } = await import(SESSION_REFRESH);
    const { fetchAPI, setAccessToken } = await import(VAULT_API);
    setAccessToken('t-expired');

    const [silent, data] = await Promise.all([refreshSession(), fetchAPI('/api/projects')]);

    expect(silent.ok).toBe(true);
    expect(data).toEqual({ url: '/api/projects' });
    expect(server.state.refreshCalls).toBe(1);
    expect(server.state.revokedEverything).toBe(false);
  });

  it('a request that 401s after another already renewed the session retries without refreshing', async () => {
    const server = fakeAuthServer();
    vi.stubGlobal('fetch', server.fetch);
    const { refreshSession } = await import(SESSION_REFRESH);
    const { fetchAPI, setAccessToken } = await import(VAULT_API);
    setAccessToken('t-expired');
    const renewed = await refreshSession(); // e.g. useAuth's silent refresh: the server is now on t1

    // This request leaves with the expired token; while it is in flight,
    // useAuth's effect stores the renewed one. Refreshing again would be wasted
    // at best — it must just retry with the token it now has.
    server.fetch.mockImplementationOnce(async () => {
      setAccessToken(renewed.body?.token ?? null);
      return json({ message: 'Unauthorized' }, 401);
    });
    await expect(fetchAPI('/api/organizations')).resolves.toEqual({ url: '/api/organizations' });
    expect(server.state.refreshCalls).toBe(1);
  });

  describe('two tabs (separate module instances, one shared cookie jar)', () => {
    async function twoTabs() {
      const tabA = await import(SESSION_REFRESH);
      vi.resetModules();
      const tabB = await import(SESSION_REFRESH);
      return { tabA, tabB };
    }

    it('without a lock, simultaneous refreshes revoke the session — the fake reproduces the bug', async () => {
      const server = fakeAuthServer();
      vi.stubGlobal('fetch', server.fetch);
      const { tabA, tabB } = await twoTabs();

      const [a, b] = await Promise.all([tabA.refreshSession(), tabB.refreshSession()]);

      expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
      expect(server.state.revokedEverything).toBe(true);
    });

    it('with Web Locks, the second tab waits and refreshes with the rotated cookie', async () => {
      const server = fakeAuthServer();
      vi.stubGlobal('fetch', server.fetch);
      vi.stubGlobal('navigator', { locks: fakeLockManager() });
      const { tabA, tabB } = await twoTabs();

      const [a, b] = await Promise.all([tabA.refreshSession(), tabB.refreshSession()]);

      expect([a.ok, b.ok]).toEqual([true, true]);
      expect(server.state.refreshCalls).toBe(2);
      expect(server.state.revokedEverything).toBe(false);
    });
  });
});
