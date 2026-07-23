/**
 * Aggregate size limits for interview (workflow) creation — single source of
 * truth for both the manual path (services) and the AI path (ai.middleware).
 * Env-overridable for enterprise flexibility (ICW-11).
 */

function envInt(name: string, fallback: number): number {
  if (typeof process === 'undefined') {
    return fallback;
  }
  const raw = process.env[name];
  const parsed = raw === undefined ? Number.NaN : parseInt(raw, 10);
  // Guard NaN/zero/negative: a garbage env value must not silently disable a cap
  // (`count >= NaN` is always false).
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const LIMITS = {
  MAX_SECTIONS_PER_WORKFLOW: envInt('LIMIT_MAX_SECTIONS', 100),
  MAX_STEPS_PER_WORKFLOW: envInt('LIMIT_MAX_STEPS', 250),
  // AI generation limits are deliberately stricter than the manual path.
  AI_MAX_SECTIONS: envInt('LIMIT_AI_MAX_SECTIONS', 50),
  AI_MAX_STEPS_PER_SECTION: envInt('LIMIT_AI_MAX_STEPS_PER_SECTION', 50),
  // Per-tenant AI spend ceilings (SEC-038). Enforced by ai.middleware rate
  // limiters, keyed on tenantId. Env-overridable so ops can tune without a
  // deploy; defaults preserve the historical hardcoded caps.
  AI_RATE_LIMIT_PER_MINUTE: envInt('AI_TENANT_RPM_LIMIT', 20),
  AI_RATE_LIMIT_PER_DAY: envInt('AI_TENANT_DAILY_LIMIT', 500),
  // Rolling per-tenant token budget (ICW2-B7). Deliberately generous — this is
  // a cost-control backstop, not a business quota, so an unset env must never
  // break existing flows. 20M tokens/30 days is well above what the existing
  // RPM/daily request caps could plausibly generate even at sustained max
  // usage, while still bounding a runaway/compromised tenant's spend.
  AI_TENANT_MONTHLY_TOKEN_BUDGET: envInt('AI_TENANT_MONTHLY_TOKEN_BUDGET', 20_000_000),
  // Rolling window length for the token budget above. Not currently expected
  // to be overridden, but env-configurable for consistency with the rest of
  // this file and to ease testing.
  AI_TENANT_BUDGET_WINDOW_DAYS: envInt('AI_TENANT_BUDGET_WINDOW_DAYS', 30),
};

/**
 * Thrown when a creation would exceed a LIMITS cap. `statusCode` is honored by
 * `classifyRouteError`, so routes surface this as a 400 without special-casing.
 */
export class LimitExceededError extends Error {
  readonly statusCode = 400;
}
