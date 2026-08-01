import { eq, and, getTableName, type SQL } from "drizzle-orm";

import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

/**
 * DB-level tenant-isolation helper (SEC-051, defense in depth).
 *
 * Builds a WHERE condition that ALWAYS includes `tenant_id = :tenantId`, so a
 * query cannot accidentally span tenants because a caller forgot the predicate.
 * Fails closed: throws if the table has no `tenantId` column, or if `tenantId`
 * is empty/blank (an empty value would otherwise match every row — the class of
 * bug behind past cross-tenant leaks).
 *
 * Usage — wrap the caller's own condition instead of hand-writing the tenant AND:
 *
 *   const rows = await db.select().from(workflowRuns)
 *     .where(withTenant(workflowRuns, tenantId, eq(workflowRuns.id, id)));
 *
 * This is a guardable convention, not a structural guarantee — the structural
 * backstop (Postgres RLS) is tracked as the remaining half of SEC-051.
 */
export function withTenant<T extends PgTable>(
  table: T,
  tenantId: string,
  baseCondition?: SQL,
): SQL {
  if (typeof tenantId !== "string" || tenantId.trim().length === 0) {
    throw new Error(
      `Tenant Isolation Error: a non-empty tenantId is required (table "${getTableName(table)}").`,
    );
  }

  const tenantCol = (table as unknown as Record<string, PgColumn | undefined>).tenantId;
  if (!tenantCol) {
    throw new Error(
      `Tenant Isolation Error: table "${getTableName(table)}" has no tenantId column.`,
    );
  }

  const tenantCondition = eq(tenantCol, tenantId);
  if (!baseCondition) {
    return tenantCondition;
  }
  // `and` with two defined conditions never returns undefined.
  return and(tenantCondition, baseCondition) as SQL;
}
