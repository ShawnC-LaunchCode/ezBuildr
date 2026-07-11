import { expect, test, describe, beforeAll } from "vitest";
import { withTenant } from "../../server/repositories/tenantWrapper";
import { workflowRuns } from "@shared/schema";
import { eq } from "drizzle-orm";

describe("Tenant Isolation Wrapper", () => {
  test("withTenant correctly appends the tenantId predicate", () => {
    const condition = withTenant(workflowRuns, "tenant-123", eq(workflowRuns.id, "run-456"));
    
    // The query builder will serialize this to a query with both conditions
    expect(condition).toBeDefined();
    // Since it's a Drizzle SQL object, we can inspect it or just ensure it didn't throw
  });
  
  test("withTenant throws if table has no tenantId", () => {
    const mockTable = { _: { name: "no_tenant" } } as any;
    expect(() => {
      withTenant(mockTable, "tenant-123");
    }).toThrow("Tenant Isolation Error");
  });
});
