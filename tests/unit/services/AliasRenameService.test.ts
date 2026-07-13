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
    });
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
    expect(mockDocHookRepo.update).toHaveBeenCalledWith("dh-1", { inputKeys: ["newName"] });
    expect(mockLifecycleRepo.update).toHaveBeenCalledWith("lh-1", { inputKeys: ["a", "newName", "b"] });
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
    expect(mockStepRepo.update).toHaveBeenCalledWith("step-final", expect.anything());
    expect(updatePayload.config?.documents).toEqual([
      { documentId: "d1", mapping: { name: { type: "variable", source: "newName" } } },
    ]);
  });

  it("should report zero updates when nothing references the alias", async () => {
    const result = await service.propagateRename("wf-1", "oldName", "newName");
    expect(result).toEqual({
      transformBlocksUpdated: 0,
      documentHooksUpdated: 0,
      lifecycleHooksUpdated: 0,
      finalBlockStepsUpdated: 0,
    });
    expect(mockStepRepo.update).not.toHaveBeenCalled();
  });

  it("should continue with other reference types when one fails", async () => {
    mockTransformRepo.findByWorkflowId.mockRejectedValue(new Error("db down"));
    mockDocHookRepo.findByWorkflowId.mockResolvedValue([
      { id: "dh-1", inputKeys: ["oldName"] },
    ] as never);

    const result = await service.propagateRename("wf-1", "oldName", "newName");

    expect(result.transformBlocksUpdated).toBe(0);
    expect(result.documentHooksUpdated).toBe(1);
  });
});
