import { describe, expect, it, vi } from "vitest";

import { AdminOrgStatsService } from "../../../server/services/AdminOrgStatsService";

import type { AdminOrgStatsQueryRow } from "../../../server/repositories/AdminOrgStatsRepository";

function makeRow(overrides: Partial<AdminOrgStatsQueryRow> = {}): AdminOrgStatsQueryRow {
  return {
    org_id: "org-1",
    org_name: "Acme Ops",
    slug: "acme-ops",
    domain: "acme.test",
    tenant_id: "tenant-1",
    tenant_name: "Acme Tenant",
    created_at: "2026-07-01T12:00:00.000Z",
    member_count: "7",
    admin_member_count: "2",
    project_count: "3",
    active_project_count: "2",
    archived_project_count: "1",
    workflow_count: "8",
    active_workflow_count: "5",
    draft_workflow_count: "2",
    archived_workflow_count: "1",
    public_workflow_count: "4",
    database_count: "2",
    native_database_count: "1",
    external_database_count: "1",
    table_count: "6",
    column_count: "18",
    row_count: "240",
    value_count: "720",
    template_count: "3",
    template_version_count: "5",
    generated_document_count: "11",
    datavault_storage_bytes: "1024",
    generated_document_storage_bytes: "2048",
    template_storage_bytes: "512",
    total_run_count: "40",
    completed_run_count: "30",
    in_progress_run_count: "10",
    runs_24h: "4",
    runs_7d: "18",
    runs_30d: "32",
    last_run_at: "2026-07-12T10:30:00.000Z",
    ...overrides,
  };
}

describe("AdminOrgStatsService", () => {
  it("rejects non-admin callers before reading stats", async () => {
    const listOrgStats = vi.fn<() => Promise<AdminOrgStatsQueryRow[]>>().mockResolvedValue([]);
    const repository = {
      listOrgStats,
    };
    const service = new AdminOrgStatsService(repository);

    await expect(service.getOrgStats({ id: "user-1", role: "creator" }))
      .rejects.toThrow("Access denied - admin role required");
    expect(repository.listOrgStats).not.toHaveBeenCalled();
  });

  it("maps organization usage totals for admin callers", async () => {
    const listOrgStats = vi.fn<() => Promise<AdminOrgStatsQueryRow[]>>()
      .mockResolvedValue([makeRow(), makeRow({
        org_id: "org-2",
        org_name: "Beta Legal",
        project_count: 1,
        workflow_count: 2,
        database_count: 0,
        table_count: 0,
        row_count: 0,
        datavault_storage_bytes: 0,
        generated_document_storage_bytes: 100,
        template_storage_bytes: 0,
        total_run_count: 3,
        completed_run_count: 1,
        in_progress_run_count: 2,
        runs_24h: 0,
        runs_7d: 1,
        runs_30d: 2,
      })]);
    const repository = {
      listOrgStats,
    };
    const service = new AdminOrgStatsService(repository);

    const result = await service.getOrgStats({ id: "admin-1", role: "admin" });

    expect(result.summary.totalOrganizations).toBe(2);
    expect(result.summary.totalProjects).toBe(4);
    expect(result.summary.totalWorkflows).toBe(10);
    expect(result.summary.totalStorageBytes).toBe(3684);
    expect(result.summary.runsLast24h).toBe(4);
    expect(result.summary.runsLast7d).toBe(19);
    expect(result.summary.runsLast30d).toBe(34);
    expect(result.summary.busiestOrg).toEqual({
      id: "org-1",
      name: "Acme Ops",
      runsLast30d: 32,
    });
    expect(result.organizations[0]?.runs.completionRate).toBe(75);
    expect(result.organizations[0]?.storage.totalBytes).toBe(3584);
  });
});
