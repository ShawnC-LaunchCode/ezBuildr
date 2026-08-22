import { tenants } from "@shared/schema";

import { db } from "../db";
import { logger } from "../logger";
import { withTenant } from "./rlsContext";

/**
 * Run `fn` once per tenant, each inside that tenant's own scoped transaction.
 *
 * THE PATTERN FOR BACKGROUND JOBS (RLS-7). A cron job, a cleanup sweep or a
 * rollup has no request and therefore no ambient tenant, so every read it does
 * on an RLS-covered table returns nothing under enforcement. The job does not
 * fail — it succeeds, having processed zero rows, and logs a cheerful summary
 * saying so. `PlaceholderUserCleanupService` would have reported "No
 * placeholder users found for cleanup" forever.
 *
 * The fix is deliberately NOT a second BYPASSRLS role. A job that iterates
 * tenants explicitly is scoped exactly like the rest of the application, gets
 * the same policy checks, and cannot leak across tenants even if its own
 * predicates are wrong. A bypass role would give every scheduled job
 * system-wide reach in exchange for saving a loop.
 *
 * `tenants` itself carries NO RLS policy (it is the root of the ownership
 * graph, not a tenant-owned row — see migration 0001's table list, which
 * includes `tenant_domains` but not `tenants`), so enumerating tenant ids on
 * the ordinary pool needs no special privilege.
 *
 * One tenant's failure does not abort the sweep: `fn` is called per tenant and
 * errors are logged and counted, because a single corrupt tenant should not
 * stop a nightly job for everyone else.
 */
export async function forEachTenant<T>(
  jobName: string,
  fn: (tenantId: string, tx: Parameters<Parameters<typeof withTenant>[1]>[0]) => Promise<T>,
): Promise<{ results: T[]; failures: number }> {
  const rows = await db.select({ id: tenants.id }).from(tenants);
  const results: T[] = [];
  let failures = 0;

  for (const { id } of rows) {
    try {
      results.push(await withTenant(id, (tx) => fn(id, tx)));
    } catch (error) {
      failures += 1;
      logger.error({ err: error, job: jobName, tenantId: id }, "Per-tenant job step failed");
    }
  }

  if (failures > 0) {
    logger.warn({ job: jobName, tenantCount: rows.length, failures }, "Per-tenant job completed with failures");
  }
  return { results, failures };
}
