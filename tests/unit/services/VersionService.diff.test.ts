import { beforeEach, describe, expect, it, vi } from "vitest";

import { CURRENT_VERSION_ID } from "@shared/config";

const getWorkflowWithDetails = vi.fn();
const selectLimit = vi.fn();
const hasWorkflowRole = vi.fn();
const diff = vi.fn();

vi.mock("../../../server/services/WorkflowService", () => ({
  workflowService: { getWorkflowWithDetails },
}));

vi.mock("../../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: selectLimit }),
      }),
    }),
    query: {
      blocks: { findMany: vi.fn().mockResolvedValue([]) },
      documentHooks: { findMany: vi.fn().mockResolvedValue([]) },
      lifecycleHooks: { findMany: vi.fn().mockResolvedValue([]) },
    },
  },
  initializeDatabase: vi.fn(),
}));

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
    selectLimit.mockResolvedValue([storedVersion("version-1", { title: "Stored title" })]);

    await (await service()).diffVersions("version-1", CURRENT_VERSION_ID, "user-1");

    // Only version 1 is loaded from the table — "current" is never looked up as a row.
    expect(selectLimit).toHaveBeenCalledTimes(1);
    expect(getWorkflowWithDetails).toHaveBeenCalledWith("workflow-1", "user-1");

    const [left, right] = diff.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(left).toEqual({ title: "Stored title" });
    expect(right).toMatchObject({ title: "Live title", projectId: "project-1" });
  });

  it("diffs two stored versions without serializing the live workflow", async () => {
    selectLimit
      .mockResolvedValueOnce([storedVersion("version-1", { title: "First" })])
      .mockResolvedValueOnce([storedVersion("version-2", { title: "Second" })]);

    await (await service()).diffVersions("version-1", "version-2", "user-1");

    expect(getWorkflowWithDetails).not.toHaveBeenCalled();
    expect(diff).toHaveBeenCalledWith({ title: "First" }, { title: "Second" });
  });

  it("denies access before serializing when the user cannot view version 1's workflow", async () => {
    selectLimit.mockResolvedValue([storedVersion("version-1", { title: "Stored title" })]);
    hasWorkflowRole.mockResolvedValue(false);

    await expect(
      (await service()).diffVersions("version-1", CURRENT_VERSION_ID, "user-1"),
    ).rejects.toThrow(/Access denied/);

    expect(getWorkflowWithDetails).not.toHaveBeenCalled();
    expect(diff).not.toHaveBeenCalled();
  });

  it("throws when version 1 does not exist", async () => {
    selectLimit.mockResolvedValue([]);

    await expect(
      (await service()).diffVersions("missing", CURRENT_VERSION_ID, "user-1"),
    ).rejects.toThrow("Version 1 not found");
  });

  it("throws when the stored target version does not exist", async () => {
    selectLimit
      .mockResolvedValueOnce([storedVersion("version-1", { title: "First" })])
      .mockResolvedValueOnce([]);

    await expect(
      (await service()).diffVersions("version-1", "missing", "user-1"),
    ).rejects.toThrow("Version 2 not found");
  });
});
