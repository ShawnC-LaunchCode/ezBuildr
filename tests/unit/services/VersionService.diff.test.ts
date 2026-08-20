import { beforeEach, describe, expect, it, vi } from "vitest";

import { CURRENT_VERSION_ID } from "@shared/config";

import { enterTenantContextForTests } from "../../../server/utils/rlsContext";

const TEST_TENANT_ID = "tenant-version-service-diff-test";

const getWorkflowWithDetails = vi.fn();
const selectLimit = vi.fn();
const hasWorkflowRole = vi.fn();
const diff = vi.fn();

vi.mock("../../../server/services/WorkflowService", () => ({
  workflowService: { getWorkflowWithDetails },
}));

// RLS-2e: VersionService now opens a tenant-scoped transaction via
// withCurrentTenant -> db.transaction for every public method (including
// diffVersions), and reads via `scopedTx.*` rather than `db.*` inside it.
// The stub tx handed to db.transaction's callback exposes the same
// `select`/`query` chains as `db` itself, plus a no-op `execute` (used by
// applyTenantToTransaction to set the GUC) — this suite calls VersionService
// directly (no HTTP), so per the RLS rollout's measured hazard,
// `enterTenantContextForTests` is called inside each test body (beforeEach
// does not propagate through AsyncLocalStorage into the test).
vi.mock("../../../server/db", () => {
  const select = () => ({
    from: () => ({
      where: () => ({ limit: selectLimit }),
    }),
  });
  const query = {
    blocks: { findMany: vi.fn().mockResolvedValue([]) },
    documentHooks: { findMany: vi.fn().mockResolvedValue([]) },
    lifecycleHooks: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return {
    db: {
      select,
      query,
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ select, query, execute: vi.fn().mockResolvedValue(undefined) })
      ),
    },
    initializeDatabase: vi.fn(),
  };
});

vi.mock("../../../server/services/AclService", () => ({
  aclService: { hasWorkflowRole },
}));

vi.mock("../../../server/services/diff/WorkflowDiffService", () => ({
  workflowDiffService: { diff },
}));

const storedVersion = (id: string, graphJson: unknown) => ({
  id,
  workflowId: "workflow-1",
  graphJson,
});

describe("VersionService.diffVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasWorkflowRole.mockResolvedValue(true);
    diff.mockReturnValue({ sections: [], steps: [], summary: {} });
    getWorkflowWithDetails.mockResolvedValue({
      id: "workflow-1",
      title: "Live title",
      description: null,
      projectId: "project-1",
      settings: {},
      intakeConfig: {},
      sections: [],
      logicRules: [],
      transformBlocks: [],
    });
  });

  const service = async () => {
    const { VersionService } = await import("../../../server/services/VersionService");
    return new VersionService();
  };

  it("diffs a stored version against the live workflow when the target is CURRENT_VERSION_ID", async () => {
    enterTenantContextForTests(TEST_TENANT_ID);
    selectLimit.mockResolvedValue([storedVersion("version-1", { title: "Stored title" })]);

    await (await service()).diffVersions("version-1", CURRENT_VERSION_ID, "user-1");

    // Only version 1 is loaded from the table — "current" is never looked up as a row.
    expect(selectLimit).toHaveBeenCalledTimes(1);
    expect(getWorkflowWithDetails).toHaveBeenCalledWith("workflow-1", "user-1", expect.any(Object));

    const [left, right] = diff.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(left).toEqual({ title: "Stored title" });
    expect(right).toMatchObject({ title: "Live title", projectId: "project-1" });
  });

  it("diffs two stored versions without serializing the live workflow", async () => {
    enterTenantContextForTests(TEST_TENANT_ID);
    selectLimit
      .mockResolvedValueOnce([storedVersion("version-1", { title: "First" })])
      .mockResolvedValueOnce([storedVersion("version-2", { title: "Second" })]);

    await (await service()).diffVersions("version-1", "version-2", "user-1");

    expect(getWorkflowWithDetails).not.toHaveBeenCalled();
    expect(diff).toHaveBeenCalledWith({ title: "First" }, { title: "Second" });
  });

  it("denies access before serializing when the user cannot view version 1's workflow", async () => {
    enterTenantContextForTests(TEST_TENANT_ID);
    selectLimit.mockResolvedValue([storedVersion("version-1", { title: "Stored title" })]);
    hasWorkflowRole.mockResolvedValue(false);

    await expect(
      (await service()).diffVersions("version-1", CURRENT_VERSION_ID, "user-1"),
    ).rejects.toThrow(/Access denied/);

    expect(getWorkflowWithDetails).not.toHaveBeenCalled();
    expect(diff).not.toHaveBeenCalled();
  });

  it("throws when version 1 does not exist", async () => {
    enterTenantContextForTests(TEST_TENANT_ID);
    selectLimit.mockResolvedValue([]);

    await expect(
      (await service()).diffVersions("missing", CURRENT_VERSION_ID, "user-1"),
    ).rejects.toThrow("Version 1 not found");
  });

  it("throws when the stored target version does not exist", async () => {
    enterTenantContextForTests(TEST_TENANT_ID);
    selectLimit
      .mockResolvedValueOnce([storedVersion("version-1", { title: "First" })])
      .mockResolvedValueOnce([]);

    await expect(
      (await service()).diffVersions("version-1", "missing", "user-1"),
    ).rejects.toThrow("Version 2 not found");
  });
});
