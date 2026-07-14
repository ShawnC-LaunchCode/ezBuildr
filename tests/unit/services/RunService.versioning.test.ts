/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RunService } from "../../../server/services/RunService";

describe("RunService version pinning", () => {
  let runRepo: any;
  let workflowRepo: any;
  let authResolver: any;
  let persistenceWriter: any;
  let lifecycleService: any;
  let metricsService: any;
  let service: RunService;

  beforeEach(() => {
    vi.clearAllMocks();

    runRepo = {
      create: vi.fn(async (data) => ({ id: "run-1", ...data })),
    };
    workflowRepo = {
      findByPublicLink: vi.fn(),
    };
    authResolver = {
      verifyCreateAccess: vi.fn(),
    };
    persistenceWriter = {
      createRun: vi.fn(async (data) => ({ id: "run-1", ...data })),
    };
    lifecycleService = {
      loadSnapshotValues: vi.fn(),
      generateRandomValues: vi.fn(),
      populateInitialValues: vi.fn().mockResolvedValue(undefined),
      determineStartSection: vi.fn(),
      executeOnRunStart: vi.fn().mockResolvedValue(undefined),
    };
    metricsService = {
      captureRunStarted: vi.fn().mockResolvedValue(undefined),
    };

    service = new RunService(
      runRepo,
      {} as any,
      workflowRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      authResolver,
      {} as any,
      persistenceWriter,
      lifecycleService,
      {} as any,
      metricsService,
      {} as any,
      {} as any,
    );
  });

  it("rejects anonymous createRun when the workflow has no published version", async () => {
    authResolver.verifyCreateAccess.mockResolvedValue({
      id: "wf-1",
      pinnedVersionId: null,
      currentVersionId: null,
    });

    await expect(service.createRun("wf-1", undefined, {} as any)).rejects.toThrow(
      "Workflow has no published version for anonymous runs"
    );
    expect(persistenceWriter.createRun).not.toHaveBeenCalled();
  });

  it("stamps anonymous createRun with the pinned version", async () => {
    authResolver.verifyCreateAccess.mockResolvedValue({
      id: "wf-1",
      pinnedVersionId: "version-pinned",
      currentVersionId: "version-current",
    });

    await service.createRun("wf-1", undefined, {} as any);

    expect(persistenceWriter.createRun).toHaveBeenCalledWith(expect.objectContaining({
      workflowId: "wf-1",
      workflowVersionId: "version-pinned",
    }));
    expect(metricsService.captureRunStarted).toHaveBeenCalledWith(
      "wf-1",
      "run-1",
      undefined,
      "version-pinned",
      expect.anything()
    );
    expect(lifecycleService.executeOnRunStart).toHaveBeenCalledWith("run-1", "wf-1", "version-pinned");
  });

  it("rejects public-link anonymous runs with no published version", async () => {
    workflowRepo.findByPublicLink.mockResolvedValue({
      id: "wf-1",
      status: "active",
      isPublic: true,
      pinnedVersionId: null,
      currentVersionId: null,
    });

    await expect(service.createAnonymousRun("public-link")).rejects.toThrow(
      "Workflow has no published version for anonymous runs"
    );
    expect(runRepo.create).not.toHaveBeenCalled();
  });

  it("stamps public-link anonymous runs with the current version when no pin exists", async () => {
    workflowRepo.findByPublicLink.mockResolvedValue({
      id: "wf-1",
      status: "active",
      isPublic: true,
      pinnedVersionId: null,
      currentVersionId: "version-current",
    });

    await service.createAnonymousRun("public-link");

    expect(runRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      workflowId: "wf-1",
      workflowVersionId: "version-current",
    }));
    expect(lifecycleService.executeOnRunStart).toHaveBeenCalledWith("run-1", "wf-1", "version-current");
  });
});
