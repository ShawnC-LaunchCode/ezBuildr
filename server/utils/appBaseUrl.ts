/**
 * Resolves the public base URL of this deployment, for building absolute links
 * that are emailed or handed to a browser (password resets, invites, magic
 * links, public workflow URLs).
 *
 * Why this exists: several call sites branched on `NODE_ENV === 'production'`
 * and hardcoded `https://www.ezbuildr.com`. But **dev and test both run with
 * `NODE_ENV=production`** (they are production builds of the app, deployed to
 * non-production Railway environments), so those branches sent recipients of a
 * dev-environment invite to the live site. `NODE_ENV` says how the app is built,
 * not where it is reachable — only the configured base URL knows that.
 *
 * Precedence follows RunResumeService, which already had it right. The trailing
 * slash strip matters because callers append a rooted path (`${base}/invites/x`)
 * and Railway variables are routinely set with a trailing slash.
 *
 * Reads `process.env` on every call rather than at module load, so tests can
 * set the variables per-case.
 */
const BASE_URL_VARS = ['BASE_URL', 'VITE_BASE_URL', 'PUBLIC_URL'] as const;

const LOCAL_FALLBACK = 'http://localhost:5000';

export function getAppBaseUrl(): string {
  for (const name of BASE_URL_VARS) {
    // An unset variable and one set to "" are both "not configured" -- Railway
    // and .env files produce the latter, and `??` alone would let it through.
    const value = process.env[name]?.trim();
    if (value !== undefined && value !== '') {
      return value.replace(/\/+$/, '');
    }
  }
  return LOCAL_FALLBACK;
}
