import { PgDialect } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { withTenant } from "../../server/repositories/tenantWrapper";

import { datavaultDatabases, workflowRuns } from "@shared/schema";

const dialect = new PgDialect();
const compile = (sql: ReturnType<typeof withTenant>) => dialect.sqlToQuery(sql);

describe("withTenant (SEC-051 tenant isolation helper)", () => {
  test("always emits the tenant_id predicate alongside the caller's condition", () => {
    const { sql, params } = compile(
      withTenant(datavaultDatabases, "tenant-123", eq(datavaultDatabases.id, "db-456")),
    );
    expect(sql).toContain("tenant_id");
    // Both the tenant id and the caller's value are bound as params.
    expect(params).toContain("tenant-123");
    expect(params).toContain("db-456");
  });

  test("emits the tenant_id predicate even with no base condition", () => {
    const { sql, params } = compile(withTenant(datavaultDatabases, "tenant-123"));
    expect(sql).toContain("tenant_id");
    expect(params).toContain("tenant-123");
  });

  test("fails closed on an empty/blank tenantId (would otherwise match all rows)", () => {
    expect(() => withTenant(datavaultDatabases, "")).toThrow("non-empty tenantId");
    expect(() => withTenant(datavaultDatabases, "   ")).toThrow("non-empty tenantId");
  });

  test("fails closed on a table with no tenantId column", () => {
    // workflow_runs is scoped indirectly (via its workflow/project), not by a
    // tenantId column — the helper refuses it rather than silently doing nothing.
    expect(() => withTenant(workflowRuns, "tenant-123")).toThrow("has no tenantId column");
  });
});
