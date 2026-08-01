import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "../../server/db";
import { applyTenantToTransaction, withTenant } from "../../server/utils/rlsContext";

const TENANT_A = "11111111-1111-1111-1111-111111111111";

function firstValue(result: unknown): unknown {
  // node-postgres returns { rows: [...] }; be defensive across driver shapes.
  const rows = (result as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as Array<Record<string, unknown>>);
  return rows?.[0]?.t;
}

describe("RLS tenant context (SEC-051)", () => {
  test("withTenant pins app.current_tenant_id inside the transaction", async () => {
    const inside = await withTenant(TENANT_A, async (tx) => {
      const r = await tx.execute(sql`SELECT current_setting('app.current_tenant_id', true) AS t`);
      return firstValue(r);
    });
    expect(inside).toBe(TENANT_A);
  });

  test("the tenant setting does NOT leak to a later query on the pool (transaction-local)", async () => {
    await withTenant(TENANT_A, async (tx) => {
      await tx.execute(sql`SELECT 1`);
    });
    // A subsequent query (which may reuse the same pooled connection) must not
    // still see TENANT_A — that would be a cross-tenant leak.
    const after = await db.execute(sql`SELECT current_setting('app.current_tenant_id', true) AS t`);
    const val = firstValue(after);
    expect(val === null || val === "").toBe(true);
  });

  test("refuses an empty tenant id (fail closed)", async () => {
    await expect(
      db.transaction((tx) => applyTenantToTransaction(tx, "")),
    ).rejects.toThrow(/empty tenant/i);
  });
});
