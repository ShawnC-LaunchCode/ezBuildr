import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";

import {
  documentHookRepository,
  lifecycleHookRepository,
  pageRepository,
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
  pageRepository: {
    findByWorkflowId: vi.fn(),
    update: vi.fn(),
  },
  sectionRepository: {
    findByWorkflowId: vi.fn(),
    update: vi.fn(),
  },
  stepRepository: {
    findByPageIds: vi.fn(),
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
  let mockPageRepo: Mocked<typeof pageRepository>;
  let mockSectionRepo: Mocked<typeof sectionRepository>;
  let mockStepRepo: Mocked<typeof stepRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransformRepo = transformBlockRepository as Mocked<typeof transformBlockRepository>;
    mockDocHookRepo = documentHookRepository as Mocked<typeof documentHookRepository>;
    mockLifecycleRepo = lifecycleHookRepository as Mocked<typeof lifecycleHookRepository>;
    mockPageRepo = pageRepository as Mocked<typeof pageRepository>;
    mockSectionRepo = sectionRepository as Mocked<typeof sectionRepository>;
    mockStepRepo = stepRepository as Mocked<typeof stepRepository>;

    mockTransformRepo.findByWorkflowId.mockResolvedValue([]);
    mockDocHookRepo.findByWorkflowId.mockResolvedValue([]);
    mockLifecycleRepo.findByWorkflowId.mockResolvedValue([]);
    mockPageRepo.findByWorkflowId.mockResolvedValue([]);
    mockSectionRepo.findByWorkflowId.mockResolvedValue([]);
    mockStepRepo.findByPageIds.mockResolvedValue([]);
    // NOTE: update is inherited from BaseRepository, so it is ONE shared
    // mock across every repository singleton — assert on its calls by id
    mockStepRepo.update.mockImplementation((async (_id: string, data: unknown) => data) as never);
    mockPageRepo.update.mockImplementation((async (_id: string, data: unknown) => data) as never);
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
    mockPageRepo.findByWorkflowId.mockResolvedValue([{ id: "page-1" }] as never);
    mockStepRepo.findByPageIds.mockResolvedValue([
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
    mockPageRepo.findByWorkflowId.mockResolvedValue([{ id: "page-1" }] as never);
    mockStepRepo.findByPageIds.mockResolvedValue([
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

  it("should rewrite a page's visibleIf variable reference", async () => {
    mockPageRepo.findByWorkflowId.mockResolvedValue([
      {
        id: "page-dependent",
        visibleIf: {
          type: "group",
          id: "g1",
          operator: "AND",
          conditions: [
            { type: "condition", id: "c1", variable: "oldName", operator: "is_not_empty", valueType: "constant" },
          ],
        },
      },
      { id: "page-untouched", visibleIf: null },
    ] as never);
    mockStepRepo.findByPageIds.mockResolvedValue([]);

    const result = await service.propagateRename("wf-1", "oldName", "newName");

    expect(result.pageVisibleIfUpdated).toBe(1);
    expect(mockPageRepo.update).toHaveBeenCalledWith("page-dependent", {
      visibleIf: {
        type: "group",
        id: "g1",
        operator: "AND",
        conditions: [
          { type: "condition", id: "c1", variable: "newName", operator: "is_not_empty", valueType: "constant" },
        ],
      },
    }, undefined);
    expect(mockPageRepo.update).not.toHaveBeenCalledWith("page-untouched", expect.anything());
  });

  it("rewrites a Section visibleIf including a right-hand variable operand", async () => {
    mockSectionRepo.findByWorkflowId.mockResolvedValue([{
      id: "section-dependent",
      visibleIf: {
        type: "group",
        id: "group",
        operator: "AND",
        conditions: [{
          type: "condition",
          id: "condition",
          variable: "controller",
          operator: "equals",
          value: "oldName",
          value2: "oldName",
          valueType: "variable",
        }],
      },
    }] as never);

    const result = await service.propagateRename("wf-1", "oldName", "newName");

    expect(result.sectionVisibleIfUpdated).toBe(1);
    const update = mockSectionRepo.update.mock.calls[0]?.[1] as {
      visibleIf: { conditions: Array<{ value: unknown; value2: unknown }> };
    };
    expect(update.visibleIf.conditions[0]).toMatchObject({ value: "newName", value2: "newName" });
  });

  it("should rewrite nested AND/OR condition groups without touching other aliases", async () => {
    mockPageRepo.findByWorkflowId.mockResolvedValue([{ id: "page-1" }] as never);
    mockStepRepo.findByPageIds.mockResolvedValue([
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
    mockPageRepo.findByWorkflowId.mockResolvedValue([{ id: "page-1" }] as never);
    mockStepRepo.findByPageIds.mockResolvedValue([
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

  it("does not need to touch logic rules: they store step/page ids, not aliases", async () => {
    // logic_rules.conditionStepId/targetStepId/targetPageId are UUID
    // foreign keys resolved from alias to id once at ingest time
    // (WorkflowContentIngestService.syncLogicRules); nothing here can go
    // stale on rename, so propagateRename has no logic-rule reference type
    // and this rename must not touch page/step rows that merely happen
    // to be a logic rule's target.
    mockPageRepo.findByWorkflowId.mockResolvedValue([{ id: "page-1", visibleIf: null }] as never);
    mockStepRepo.findByPageIds.mockResolvedValue([
      { id: "step-target", type: "short_text", config: null, visibleIf: null },
    ] as never);

    const result = await service.propagateRename("wf-1", "oldName", "newName");

    expect(result.stepVisibleIfUpdated).toBe(0);
    expect(result.pageVisibleIfUpdated).toBe(0);
    expect(mockStepRepo.update).not.toHaveBeenCalled();
    expect(mockPageRepo.update).not.toHaveBeenCalled();
  });

  it("should report zero updates when nothing references the alias", async () => {
    const result = await service.propagateRename("wf-1", "oldName", "newName");
    expect(result).toEqual({
      transformBlocksUpdated: 0,
      documentHooksUpdated: 0,
      lifecycleHooksUpdated: 0,
      finalBlockStepsUpdated: 0,
      stepVisibleIfUpdated: 0,
      pageVisibleIfUpdated: 0,
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
