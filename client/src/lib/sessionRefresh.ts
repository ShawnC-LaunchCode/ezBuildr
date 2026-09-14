/**
 * Session refresh — at most one at a time, within a tab AND across tabs.
 *
 * The refresh token ROTATES: every successful `POST /api/auth/refresh-token`
 * revokes the cookie it was sent with and sets a new one, and the server treats
 * a revoked token coming back as theft — it revokes EVERY session the user has
 * (`AuthService.rotateRefreshToken`). So two refreshes sent with the same cookie
 * are not redundant, they are fatal: the second one signs the user out on every
 * device. That happened in production on 2026-09-14 — after an idle builder
 * session, one in-app navigation fired three requests, all three 401'd, each sent
 * its own refresh, and the owner was logged out everywhere.
 *
 * Two guards, and both are needed:
 * - in-tab: concurrent callers share ONE in-flight refresh promise;
 * - cross-tab: the request runs under a Web Lock, so another tab's refresh waits
 *   its turn and then goes out carrying the cookie the first one just set.
 *
 * Every refresh in the client goes through here (`fetchAPI`'s 401 retry and
 * `useAuth`'s silent refresh). Do not POST to the endpoint directly.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
const LOCK_NAME = "ezbuildr:session-refresh";

export interface RefreshedSession {
  token?: string;
  user?: unknown;
}

export interface SessionRefreshResult {
  ok: boolean;
  status: number;
  body: RefreshedSession | null;
}

let inFlight: Promise<SessionRefreshResult> | null = null;

export function refreshSession(): Promise<SessionRefreshResult> {
  if (inFlight === null) {
    inFlight = withRefreshLock(requestRefresh).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function requestRefresh(): Promise<SessionRefreshResult> {
  const res = await fetch(`${API_BASE}/api/auth/refresh-token`, {
    method: "POST",
    credentials: "include", // the refresh token is an HttpOnly cookie
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: null };
  }
  const body = await res.json().catch(() => null) as RefreshedSession | null;
  return { ok: true, status: res.status, body };
}

function withRefreshLock(run: () => Promise<SessionRefreshResult>): Promise<SessionRefreshResult> {
  // Web Locks exist in every current browser, in secure contexts (localhost
  // counts). Where they don't, the in-tab guard above still holds.
  const locks = typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : undefined;
  if (locks === undefined) {
    return run();
  }
  // LockManager.request resolves with the callback's own result.
  return locks.request(LOCK_NAME, run) as Promise<SessionRefreshResult>;
}
