/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";

import { SectionService } from "../../../server/services/SectionService";
import { sectionRepository, workflowRepository, stepRepository } from "../../../server/repositories";
import { createTestSection, createTestWorkflow } from "../../factories/workflowFactory";
import { workflowService } from "../../../server/services/WorkflowService";

import { LIMITS } from "@shared/limits";

import type { Section } from "@shared/schema";

// Mock the repositories and services
vi.mock("../../../server/repositories", () => ({
  sectionRepository: {
    findById: vi.fn(),
    findByIdAndWorkflow: vi.fn(),
    findByWorkflowId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateOrder: vi.fn(),
  },
  workflowRepository: {
    findById: vi.fn(),
  },
  stepRepository: {
    findBySectionId: vi.fn(),
  },
}));
vi.mock("../../../server/services/WorkflowService", () => ({
  workflowService: {
    verifyAccess: vi.fn(),
  },
}));

describe("SectionService", () => {
  let service: SectionService;
  let mockSectionRepo: Mocked<typeof sectionRepository>;
  let mockWorkflowSvc: Mocked<typeof workflowService>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSectionRepo = sectionRepository as Mocked<typeof sectionRepository>;
    mockWorkflowSvc = workflowService as Mocked<typeof workflowService>;

    mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
    mockSectionRepo.findByWorkflowId.mockResolvedValue([]);

    service = new SectionService(
      mockSectionRepo,
      workflowRepository as Mocked<typeof workflowRepository>,
      stepRepository as Mocked<typeof stepRepository>,
      mockWorkflowSvc
    );
  });

  describe("createSection", () => {
    it("should create a section with auto-incrementing order", async () => {
      const workflow = createTestWorkflow();
      const existing = [
        createTestSection(workflow.id, { order: 1 }),
        createTestSection(workflow.id, { order: 2 }),
      ];
      const created = createTestSection(workflow.id, { order: 3 });

      mockSectionRepo.findByWorkflowId.mockResolvedValue(existing as unknown as Section[]);
      mockSectionRepo.create.mockResolvedValue(created as unknown as Section);

      await service.createSection(workflow.id, "user-123", { title: "New Section" });

      expect(mockSectionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: workflow.id, order: 3 })
      );
    });

    it("should reject creation once the workflow section limit is reached (ICW-11)", async () => {
      const workflow = createTestWorkflow();
      const existing = Array.from({ length: LIMITS.MAX_SECTIONS_PER_WORKFLOW }, (_, i) =>
        createTestSection(workflow.id, { order: i })
      );
      mockSectionRepo.findByWorkflowId.mockResolvedValue(existing as unknown as Section[]);

      await expect(
        service.createSection(workflow.id, "user-123", { title: "One too many" })
      ).rejects.toThrow(/Section limit reached/);
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });

    it("should throw when the user lacks access", async () => {
      mockWorkflowSvc.verifyAccess.mockRejectedValue(new Error("Access denied"));

      await expect(
        service.createSection("wf-1", "user-123", { title: "Nope" })
      ).rejects.toThrow("Access denied");
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });
  });
});
