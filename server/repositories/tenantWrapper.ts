import { eq, and, type SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

/**
 * DB-level Tenant Isolation Wrapper
 * Prevents cross-tenant data leakage by enforcing tenant boundaries on any query.
 */
export function withTenant<T extends PgTable>(
  table: T,
  tenantId: string,
  baseCondition?: SQL | undefined
): SQL {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantCol = (table as any).tenantId as PgColumn | undefined;
  
  if (!tenantCol) {
    throw new Error(`Tenant Isolation Error: Table ${table._.name} does not have a tenantId column.`);
  }

  const tenantCondition = eq(tenantCol, tenantId);
  return baseCondition ? and(tenantCondition, baseCondition) : tenantCondition;
}
