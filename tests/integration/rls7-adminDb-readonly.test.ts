import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { adminDb, isAdminDbConfigured } from '../../server/db/adminDb';

import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';

/**
 * RLS-7 AC 2b — **no write is ever issued on the `adminDb` connection**,
 * asserted by a test rather than by review.
 *
 * That property is the entire argument for RLS-7's shape. The owner's ruling
 * was that the BYPASSRLS pool stays a READ path: it resolves *which* tenant
 * owns a target, and the write then runs on the normal pool inside
 * `withTenant`, where the ordinary policy checks it. The alternative — letting
 * the bypass pool write — buys one fewer query and costs the one sentence that
 * makes this design explainable.
 *
 * Enforced here by PRIVILEGE, not by inspection: `tests/setup.ts` grants the
 * bypass role `SELECT` only and revokes INSERT/UPDATE/DELETE/TRUNCATE. So a
 * regression that routes a write through `adminDb` fails with
 * `permission denied`, naming the role, instead of passing quietly.
 *
 * Why not a static scan of `AdminAccessService`: it would pass for a write
 * issued from a repository three frames down, which is exactly how the
 * mistake would actually be made.
 *
 * ⚠️ This suite is meaningful ONLY under `RLS_RESTRICTED=true`, which is what
 * provisions the bypass role and sets `ADMIN_DATABASE_URL`. In normal mode
 * there is no admin pool, so the checks skip themselves rather than pass
 * vacuously — a green run in the wrong mode must not be mistaken for evidence.
 */
/**
 * Drizzle wraps driver errors in `DrizzleQueryError`, whose own message is
 * "Failed query: …" and whose `.code` is undefined — the real SQLSTATE lives on
 * `.cause`. Asserting on the top-level message here would have failed against a
 * write that WAS correctly refused, and asserting on `.code` would pass against
 * anything at all. `42501` is insufficient_privilege.
 */
async function expectRefusedForPrivilege(run: Promise<unknown>): Promise<void> {
  let caught: unknown;
  try {
    await run;
  } catch (e) {
    caught = e;
  }
  expect(caught, 'the write was NOT refused — the bypass role can write').toBeDefined();
  const cause = (caught as { cause?: { code?: string; message?: string } }).cause;
  expect(
    cause?.code,
    `expected SQLSTATE 42501 (insufficient_privilege), got ${cause?.code ?? 'none'}: ${cause?.message ?? String(caught)}`
  ).toBe('42501');
}

describe('RLS-7: the admin bypass connection is read-only', () => {
  /**
   * Checked at RUN time, never at collection time. `tests/setup.ts` sets
   * `ADMIN_DATABASE_URL` in `beforeAll`, which happens AFTER this file is
   * imported — so a `const configured = isAdminDbConfigured()` up here reads
   * false and `it.runIf` silently skips the whole suite. That version was
   * written first and reported "1 skipped", which in a green summary is
   * indistinguishable from a pass.
   */
  const skipUnlessBypassPool = (t: { skip: () => void }): boolean => {
    if (!isAdminDbConfigured()) { t.skip(); return true; }
    return false;
  };

  it('can READ through the bypass pool', async (t) => {
    if (skipUnlessBypassPool(t)) { return; }
    // Proves the pool works at all — without this, the write-refusal below
    // could be satisfied by a connection that is simply broken.
    const rows = await adminDb.execute(sql`SELECT count(*)::int AS n FROM tenants`);
    expect(Number((rows.rows[0] as { n: number }).n)).toBeGreaterThanOrEqual(0);
  });

  it('is REFUSED when it attempts a write', async (t) => {
    if (skipUnlessBypassPool(t)) { return; }
    let ctx: IntegrationTestContext | undefined;
    try {
      ctx = await setupIntegrationTest({ tenantName: 'RLS-7 read-only proof' });

      // The control case. If this ever stops throwing, the bypass role has
      // regained write privileges and every other assertion in this file —
      // and the AC itself — is worthless.
      await expectRefusedForPrivilege(
        adminDb.execute(sql`UPDATE tenants SET name = 'hijacked' WHERE id = ${ctx.tenantId}::uuid`)
      );

      // And the row is untouched, read back through the observer.
      const [row] = await getOwnerDb().execute(
        sql`SELECT name FROM tenants WHERE id = ${ctx.tenantId}::uuid`
      ).then((r) => r.rows as Array<{ name: string }>);
      expect(row.name).not.toBe('hijacked');
    } finally {
      await ctx?.cleanup();
    }
  });

  it('is refused an INSERT as well as an UPDATE', async (t) => {
    if (skipUnlessBypassPool(t)) { return; }
    await expectRefusedForPrivilege(
      adminDb.execute(sql`INSERT INTO tenants (name, plan) VALUES ('rls7-should-not-exist', 'free')`)
    );

    const [{ n }] = await getOwnerDb().execute(
      sql`SELECT count(*)::int AS n FROM tenants WHERE name = 'rls7-should-not-exist'`
    ).then((r) => r.rows as Array<{ n: number }>);
    expect(Number(n)).toBe(0);
  });
});
