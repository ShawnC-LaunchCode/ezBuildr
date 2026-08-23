import { expect } from 'vitest';

/**
 * Assert that a CROSS-TENANT request was refused, without pinning which of the
 * two refusal codes it got.
 *
 * The code depends on whether RLS is enforced for the connection, and both
 * modes are currently live:
 *
 * - **Normal mode** — the app connects as the table OWNER, which Postgres
 *   exempts from RLS. The row is visible, the service's `eq(tenantId, …)`
 *   predicate rejects it, and the route answers **403**.
 * - **Enforced mode** (`RLS_RESTRICTED=true`, and production once `FORCE` is
 *   set) — the row is invisible, so the route never reaches a denial and
 *   answers **404**.
 *
 * Pinning either one breaks the other, and normal mode is the regression gate
 * for the whole RLS initiative, so it cannot be allowed to go red. Measured,
 * not assumed: hardcoding 404 turned `api.projects` and `creation-routes` red
 * in normal mode immediately.
 *
 * This is deliberately WEAKER than the assertion it replaces, and that is the
 * honest trade — the property these cases exist to protect is "a caller from
 * another tenant does not get the resource", which both codes satisfy. The
 * exact code is a contract detail recorded as a decision in
 * `docs/architecture/RLS_HANDOFF.md` §0b (404 accepted; it leaks strictly less).
 *
 * **Tighten this to 404 alone once `FORCE` is set everywhere** — grep for
 * `expectCrossTenantDenied` to find every site in one pass. Until then, a test
 * that passes in exactly one of the two modes is not evidence of anything.
 *
 * Note this says nothing about IN-TENANT RBAC denials (a viewer who cannot
 * edit). Those see the row perfectly well and must still assert a plain 403 —
 * do not reach for this helper there.
 */
export function expectCrossTenantDenied(status: number): void {
  expect(
    [403, 404],
    `Expected a cross-tenant request to be refused with 403 (owner mode) or ` +
    `404 (RLS enforced), got ${status}.`
  ).toContain(status);
}
