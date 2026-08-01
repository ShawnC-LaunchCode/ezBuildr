import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";

import {
  documentHookRepository,
  lifecycleHookRepository,
  sectionRepository,
  stepRepository,
  transformBlockRepository,
} from "../../../server/repositories";
import {
  AliasRenameService,
  rewriteFinalBlockMapping,
} from "../../../server/services/AliasRenameService";

vi.mock("../../../server/repositories", () => ({
  transformBlockRepository: {
    findByWorkflowId: vi.fn(),
    update: vi.fn(),
  },
  documentHookRepository: {
    findByWorkflowId: vi.fn(),
    update: vi.fn(),
  },
  lifecycleHookRepository: {
    findByWorkflowId: vi.fn(),
    update: vi.fn(),
  },
  sectionRepository: {
    findByWorkflowId: vi.fn(),
    update: vi.fn(),
  },
  stepRepository: {
    findBySectionIds: vi.fn(),
    update: vi.fn(),
  },
}));

describe("rewriteFinalBlockMapping", () => {
  it("should rewrite matching variable sources", () => {
    const options = {
      markdownHeader: "# Done",
      documents: [
        {
          documentId: "doc-1",
          mapping: {
            client: { type: "variable", source: "oldName" },
            email: { type: "variable", source: "contactEmail" },
          },
        },
      ],
    };

    const result = rewriteFinalBlockMapping(options, "oldName", "newName");

    expect(result).not.toBeNull();
    expect(result?.documents?.[0].mapping).toEqual({
      client: { type: "variable", source: "newName" },
      email: { type: "variable", source: "contactEmail" },
    });
    // untouched fields survive
    expect(result?.markdownHeader).toBe("# Done");
  });

  it("should return null when nothing references the alias", () => {
    const options = {
      documents: [
        { documentId: "doc-1", mapping: { email: { type: "variable", source: "contactEmail" } } },
      ],
    };
    expect(rewriteFinalBlockMapping(options, "oldName", "newName")).toBeNull();
  });

  it("should handle options without documents", () => {
    expect(rewriteFinalBlockMapping(null, "a", "b")).toBeNull();
    expect(rewriteFinalBlockMapping({}, "a", "b")).toBeNull();
    expect(rewriteFinalBlockMapping({ documents: [{ documentId: "d" }] }, "a", "b")).toBeNull();
  });
});

describe("AliasRenameService.propagateRename", () => {
  const service = new AliasRenameService();
  let mockTransformRepo: Mocked<typeof transformBlockRepository>;
  let mockDocHookRepo: Mocked<typeof documentHookRepository>;
  let mockLifecycleRepo: Mocked<typeof lifecycleHookRepository>;
  let mockSectionRepo: Mocked<typeof sectionRepository>;
  let mockStepRepo: Mocked<typeof stepRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransformRepo = transformBlockRepository as Mocked<typeof transformBlockRepository>;
    mockDocHookRepo = documentHookRepository as Mocked<typeof documentHookRepository>;
    mockLifecycleRepo = lifecycleHookRepository as Mocked<typeof lifecycleHookRepository>;
    mockSectionRepo = sectionRepository as Mocked<typeof sectionRepository>;
    mockStepRepo = stepRepository as Mocked<typeof stepRepository>;

    mockTransformRepo.findByWorkflowId.mockResolvedValue([]);
    mockDocHookRepo.findByWorkflowId.mockResolvedValue([]);
    mockLifecycleRepo.findByWorkflowId.mockResolvedValue([]);
    mockSectionRepo.findByWorkflowId.mockResolvedValue([]);
    mockStepRepo.findBySectionIds.mockResolvedValue([]);
    // NOTE: update is inherited from BaseRepository, so it is ONE shared
    // mock across every repository singleton — assert on its calls by id
    mockStepRepo.update.mockImplementation((async (_id: string, data: unknown) => data) as never);
    mockSectionRepo.update.mockImplementation((async (_id: string, data: unknown) => data) as never);
  });

  it("should rewrite transform block inputKeys", async () => {
    mockTransformRepo.findByWorkflowId.mockResolvedValue([
      { id: "tb-1", inputKeys: ["oldName", "other"] },
      { id: "tb-2", inputKeys: ["other"] },
    ] as never);

    const result = await service.propagateRename("wf-1", "oldName", "newName");

    expect(result.transformBlocksUpdated).toBe(1);
    expect(mockTransformRepo.update).toHaveBeenCalledWith("tb-1", {
      inputKeys: ["newName", "other"],
    }, undefined);
  });

  it("should rewrite hook inputKeys", async () => {
    mockDocHookRepo.findByWorkflowId.mockResolvedValue([
      { id: "dh-1", inputKeys: ["oldName"] },
    ] as never);
    mockLifecycleRepo.findByWorkflowId.mockResolvedValue([
      { id: "lh-1", inputKeys: ["a", "oldName", "b"] },
    ] as never);

    const result = await service.propagateRename("wf-1", "oldName", "newName");

    expect(result.documentHooksUpdated).toBe(1);
    expect(result.lifecycleHooksUpdated).toBe(1);
    expect(mockDocHookRepo.update).toHaveBeenCalledWith("dh-1", { inputKeys: ["newName"] }, undefined);
    expect(mockLifecycleRepo.update).toHaveBeenCalledWith("lh-1", { inputKeys: ["a", "newName", "b"] }, undefined);
  });

  it("should rewrite Final Block mapping sources", async () => {
    mockSectionRepo.findByWorkflowId.mockResolvedValue([{ id: "sec-1" }] as never);
    mockStepRepo.findBySectionIds.mockResolvedValue([
      {
        id: "step-final",
        type: "final",
        config: {
          documents: [
            { documentId: "d1", mapping: { name: { type: "variable", source: "oldName" } } },
          ],
        },
      },
      { id: "step-text", type: "short_text", config: null },
    ] as never);

    const result = await service.propagateRename("wf-1", "oldName", "newName");

    expect(result.finalBlockStepsUpdated).toBe(1);
    const updatePayload = mockStepRepo.update.mock.calls[0][1] as {
      config?: { documents?: unknown[] };
    };
    expect(mockStepRepo.update).toHaveBeenCalledWith("step-final", expect.anything(), undefined);
    expect(updatePayload.config?.documents).toEqual([
      { documentId: "d1", mapping: { name: { type: "variable", source: "newName" } } },
    ]);
  });

  it("should rewrite a step's visibleIf variable reference", async () => {
    mockSectionRepo.findByWorkflowId.mockResolvedValue([{ id: "sec-1" }] as never);
    mockStepRepo.findBySectionIds.mockResolvedValue([
      {
        id: "step-dependent",
        type: "short_text",
        config: null,
        visibleIf: {
          type: "group",
          id: "g1",
          operator: "AND",
          conditions: [
            { type: "condition", id: "c1", variable: "oldName", operator: "equals", value: "yes", valueType: "constant" },
          ],
        },
      },
      { id: "step-untouched", type: "short_text", config: null, visibleIf: null },
    ] as never);

    const result = await service.propagateRename("wf-1", "oldName", "newName");

    expect(result.stepVisibleIfUpdated).toBe(1);
    expect(mockStepRepo.update).toHaveBeenCalledWith("step-dependent", {
      visibleIf: {
        type: "group",
        id: "g1",
        operator: "AND",
        conditions: [
          { type: "condition", id: "c1", variable: "newName", operator: "equals", value: "yes", valueType: "constant" },
        ],
      },
    }, undefined);
    expect(mockStepRepo.update).not.toHaveBeenCalledWith("step-untouched", expect.anything());
  });

  it("should rewrite a section's visibleIf variable reference", async () => {
    mockSectionRepo.findByWorkflowId.mockResolvedValue([
      {
        id: "sec-dependent",
        visibleIf: {
          type: "group",
          id: "g1",
          operator: "AND",
          conditions: [
            { type: "condition", id: "c1", variable: "oldName", operator: "is_not_empty", valueType: "constant" },
          ],
        },
      },
      { id: "sec-untouched", visibleIf: null },
    ] as never);
    mockStepRepo.findBySectionIds.mockResolvedValue([]);

    const result = await service.propagateRename("wf-1", "oldName", "newName");

    expect(result.sectionVisibleIfUpdated).toBe(1);
    expect(mockSectionRepo.update).toHaveBeenCalledWith("sec-dependent", {
      visibleIf: {
        type: "group",
        id: "g1",
        operator: "AND",
        conditions: [
          { type: "condition", id: "c1", variable: "newName", operator: "is_not_empty", valueType: "constant" },
        ],
      },
    }, undefined);
    expect(mockSectionRepo.update).not.toHaveBeenCalledWith("sec-untouched", expect.anything());
  });

  it("should rewrite nested AND/OR condition groups without touching other aliases", async () => {
    mockSectionRepo.findByWorkflowId.mockResolvedValue([{ id: "sec-1" }] as never);
    mockStepRepo.findBySectionIds.mockResolvedValue([
      {
        id: "step-nested",
        type: "short_text",
        config: null,
        visibleIf: {
          type: "group",
          id: "root",
          operator: "AND",
          conditions: [
            { type: "condition", id: "c1", variable: "otherAlias", operator: "equals", value: "x", valueType: "constant" },
            {
              type: "group",
              id: "nested",
              operator: "OR",
              conditions: [
                { type: "condition", id: "c2", variable: "oldName", operator: "equals", value: "1", valueType: "constant" },
                { type: "condition", id: "c3", variable: "otherAlias", operator: "equals", value: "y", valueType: "constant" },
              ],
            },
          ],
        },
      },
    ] as never);

    const result = await service.propagateRename("wf-1", "oldName", "newName");

    expect(result.stepVisibleIfUpdated).toBe(1);
    const updatePayload = mockStepRepo.update.mock.calls[0][1] as {
      visibleIf: { conditions: unknown[] };
    };
    expect(updatePayload.visibleIf.conditions[0]).toEqual({
      type: "condition", id: "c1", variable: "otherAlias", operator: "equals", value: "x", valueType: "constant",
    });
    expect(
      (updatePayload.visibleIf.conditions[1] as { conditions: unknown[] }).conditions
    ).toEqual([
      { type: "condition", id: "c2", variable: "newName", operator: "equals", value: "1", valueType: "constant" },
      { type: "condition", id: "c3", variable: "otherAlias", operator: "equals", value: "y", valueType: "constant" },
    ]);
  });

  it("should not rewrite visibleIf expressions that only reference other aliases", async () => {
    mockSectionRepo.findByWorkflowId.mockResolvedValue([{ id: "sec-1" }] as never);
    mockStepRepo.findBySectionIds.mockResolvedValue([
      {
        id: "step-other",
        type: "short_text",
        config: null,
        visibleIf: {
          type: "group",
          id: "g1",
          operator: "AND",
          conditions: [
            { type: "condition", id: "c1", variable: "otherAlias", operator: "equals", value: "x", valueType: "constant" },
          ],
        },
      },
    ] as never);

    const result = await service.propagateRename("wf-1", "oldName", "newName");

    expect(result.stepVisibleIfUpdated).toBe(0);
    expect(mockStepRepo.update).not.toHaveBeenCalled();
  });

  it("does not need to touch logic rules: they store step/section ids, not aliases", async () => {
    // logic_rules.conditionStepId/targetStepId/targetSectionId are UUID
    // foreign keys resolved from alias to id once at ingest time
    // (WorkflowContentIngestService.syncLogicRules); nothing here can go
    // stale on rename, so propagateRename has no logic-rule reference type
    // and this rename must not touch section/step rows that merely happen
    // to be a logic rule's target.
    mockSectionRepo.findByWorkflowId.mockResolvedValue([{ id: "sec-1", visibleIf: null }] as never);
    mockStepRepo.findBySectionIds.mockResolvedValue([
      { id: "step-target", type: "short_text", config: null, visibleIf: null },
    ] as never);

    const result = await service.propagateRename("wf-1", "oldName", "newName");

    expect(result.stepVisibleIfUpdated).toBe(0);
    expect(result.sectionVisibleIfUpdated).toBe(0);
    expect(mockStepRepo.update).not.toHaveBeenCalled();
    expect(mockSectionRepo.update).not.toHaveBeenCalled();
  });

  it("should report zero updates when nothing references the alias", async () => {
    const result = await service.propagateRename("wf-1", "oldName", "newName");
    expect(result).toEqual({
      transformBlocksUpdated: 0,
      documentHooksUpdated: 0,
      lifecycleHooksUpdated: 0,
      finalBlockStepsUpdated: 0,
      stepVisibleIfUpdated: 0,
      sectionVisibleIfUpdated: 0,
    });
    expect(mockStepRepo.update).not.toHaveBeenCalled();
  });

  it("should abort immediately and not touch other reference types when one fails (atomic — DEBT-16)", async () => {
    // propagateRename runs inside the caller's transaction (StepService.updateStep),
    // so a failing query must reject and stop, not be swallowed and continued —
    // catching it here would let the caller believe the rename succeeded while
    // Postgres silently rolled the whole transaction back underneath it.
    mockTransformRepo.findByWorkflowId.mockRejectedValue(new Error("db down"));
    mockDocHookRepo.findByWorkflowId.mockResolvedValue([
      { id: "dh-1", inputKeys: ["oldName"] },
    ] as never);

    await expect(service.propagateRename("wf-1", "oldName", "newName")).rejects.toThrow("db down");

    expect(mockDocHookRepo.findByWorkflowId).not.toHaveBeenCalled();
  });
});
