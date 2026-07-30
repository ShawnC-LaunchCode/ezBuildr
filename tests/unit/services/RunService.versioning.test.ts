/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RunService } from "../../../server/services/RunService";

describe("RunService version pinning", () => {
  let runRepo: any;
  let workflowRepo: any;
  let authResolver: any;
  let persistenceWriter: any;
  let lifecycleService: any;
  let metricsService: any;
  let logicSvc: any;
  let stateService: any;
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
    // ICW2-B9: createRun/createAnonymousRun resolve the run's starting section
    // via logicSvc.evaluateNavigation and persist it via stateService.updateProgress.
    logicSvc = {
      evaluateNavigation: vi.fn().mockResolvedValue({
        nextSectionId: null,
        visibleSections: [],
        visibleSteps: [],
        requiredSteps: [],
        currentProgress: 0,
      }),
    };
    stateService = {
      updateProgress: vi.fn().mockResolvedValue(undefined),
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
      logicSvc,
      authResolver,
      {} as any,
      persistenceWriter,
      lifecycleService,
      stateService,
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

describe("RunService RVP-6: pin every new run at creation (Option B)", () => {
  let runRepo: any;
  let workflowRepo: any;
  let authResolver: any;
  let persistenceWriter: any;
  let lifecycleService: any;
  let metricsService: any;
  let logicSvc: any;
  let stateService: any;
  let versionSvc: any;
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
    logicSvc = {
      evaluateNavigation: vi.fn().mockResolvedValue({
        nextSectionId: null,
        visibleSections: [],
        visibleSteps: [],
        requiredSteps: [],
        currentProgress: 0,
      }),
    };
    stateService = {
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };
    versionSvc = {
      createDraftVersion: vi.fn(),
      getLatestVersion: vi.fn(),
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
      logicSvc,
      authResolver,
      {} as any,
      persistenceWriter,
      lifecycleService,
      stateService,
      metricsService,
      {} as any,
      {} as any,
      versionSvc,
    );
  });

  it("AC1: pins to a newly created draft version when the workflow has neither a published nor a pinned version", async () => {
    authResolver.verifyCreateAccess.mockResolvedValue({
      id: "wf-1",
      pinnedVersionId: null,
      currentVersionId: null,
    });
    versionSvc.createDraftVersion.mockResolvedValue({ id: "version-draft-new" });

    const run = await service.createRun("wf-1", "user-1", {} as any);

    expect(versionSvc.createDraftVersion).toHaveBeenCalledWith("wf-1", "user-1");
    expect(versionSvc.getLatestVersion).not.toHaveBeenCalled();
    expect(persistenceWriter.createRun).toHaveBeenCalledWith(expect.objectContaining({
      workflowId: "wf-1",
      workflowVersionId: "version-draft-new",
    }));
    expect(run.workflowVersionId).toBe("version-draft-new");
  });

  it("AC2: reuses the latest existing version when createDraftVersion returns null (unchanged checksum)", async () => {
    authResolver.verifyCreateAccess.mockResolvedValue({
      id: "wf-1",
      pinnedVersionId: null,
      currentVersionId: null,
    });
    versionSvc.createDraftVersion.mockResolvedValue(null);
    versionSvc.getLatestVersion.mockResolvedValue({ id: "version-existing" });

    const run = await service.createRun("wf-1", "user-1", {} as any);

    expect(versionSvc.getLatestVersion).toHaveBeenCalledWith("wf-1");
    expect(persistenceWriter.createRun).toHaveBeenCalledWith(expect.objectContaining({
      workflowId: "wf-1",
      workflowVersionId: "version-existing",
    }));
    expect(run.workflowVersionId).toBe("version-existing");
  });

  it("AC3: does not create a draft version when the workflow already resolves a pinned or published version", async () => {
    authResolver.verifyCreateAccess.mockResolvedValue({
      id: "wf-1",
      pinnedVersionId: "version-pinned",
      currentVersionId: "version-current",
    });

    await service.createRun("wf-1", "user-1", {} as any);

    expect(versionSvc.createDraftVersion).not.toHaveBeenCalled();
    expect(versionSvc.getLatestVersion).not.toHaveBeenCalled();
    expect(persistenceWriter.createRun).toHaveBeenCalledWith(expect.objectContaining({
      workflowId: "wf-1",
      workflowVersionId: "version-pinned",
    }));
  });

  it("AC4: still refuses an anonymous run on a workflow with no published version, without auto-pinning", async () => {
    authResolver.verifyCreateAccess.mockResolvedValue({
      id: "wf-1",
      pinnedVersionId: null,
      currentVersionId: null,
    });

    await expect(service.createRun("wf-1", undefined, {} as any)).rejects.toThrow(
      "Workflow has no published version for anonymous runs"
    );
    expect(versionSvc.createDraftVersion).not.toHaveBeenCalled();
    expect(persistenceWriter.createRun).not.toHaveBeenCalled();
  });
});

describe("RunService ICW2-B9: initial currentSectionId on run creation", () => {
  let runRepo: any;
  let workflowRepo: any;
  let authResolver: any;
  let persistenceWriter: any;
  let lifecycleService: any;
  let metricsService: any;
  let logicSvc: any;
  let stateService: any;
  let service: RunService;

  beforeEach(() => {
    vi.clearAllMocks();

    runRepo = {
      create: vi.fn(async (data) => ({ id: "run-1", currentSectionId: null, ...data })),
    };
    workflowRepo = {
      findByPublicLink: vi.fn(),
    };
    authResolver = {
      verifyCreateAccess: vi.fn(),
    };
    persistenceWriter = {
      createRun: vi.fn(async (data) => ({ id: "run-1", currentSectionId: null, ...data })),
    };
    lifecycleService = {
      populateInitialValues: vi.fn().mockResolvedValue(undefined),
      determineStartSection: vi.fn(),
      executeOnRunStart: vi.fn().mockResolvedValue(undefined),
    };
    metricsService = {
      captureRunStarted: vi.fn().mockResolvedValue(undefined),
    };
    logicSvc = {
      evaluateNavigation: vi.fn(),
    };
    stateService = {
      updateProgress: vi.fn().mockResolvedValue(undefined),
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
      logicSvc,
      authResolver,
      {} as any,
      persistenceWriter,
      lifecycleService,
      stateService,
      metricsService,
      {} as any,
      {} as any,
    );
  });

  it("initializes createRun's currentSectionId to the first visible section instead of leaving it null", async () => {
    authResolver.verifyCreateAccess.mockResolvedValue({
      id: "wf-1",
      pinnedVersionId: null,
      currentVersionId: "version-current",
    });
    logicSvc.evaluateNavigation.mockResolvedValue({
      nextSectionId: "section-first",
      visibleSections: ["section-first", "section-second"],
      visibleSteps: [],
      requiredSteps: [],
      currentProgress: 0,
    });

    const run = await service.createRun("wf-1", "user-1", {} as any);

    // Resolved via the same null-current-section rule `next()` uses, so the
    // starting position matches what "first visible section" already means.
    expect(logicSvc.evaluateNavigation).toHaveBeenCalledWith("wf-1", "run-1", null);
    expect(stateService.updateProgress).toHaveBeenCalledWith("run-1", "section-first");
    expect(run.currentSectionId).toBe("section-first");
    // The snapshot/randomize auto-advance path must not be touched by a plain create.
    expect(lifecycleService.determineStartSection).not.toHaveBeenCalled();
  });

  it("leaves createRun's currentSectionId null when the workflow has no visible sections", async () => {
    authResolver.verifyCreateAccess.mockResolvedValue({
      id: "wf-1",
      pinnedVersionId: null,
      currentVersionId: "version-current",
    });
    logicSvc.evaluateNavigation.mockResolvedValue({
      nextSectionId: null,
      visibleSections: [],
      visibleSteps: [],
      requiredSteps: [],
      currentProgress: 0,
    });

    const run = await service.createRun("wf-1", "user-1", {} as any);

    expect(stateService.updateProgress).not.toHaveBeenCalled();
    expect(run.currentSectionId).toBeNull();
  });

  it("uses determineStartSection (not the plain first-section resolver) when a snapshot is supplied", async () => {
    authResolver.verifyCreateAccess.mockResolvedValue({
      id: "wf-1",
      pinnedVersionId: null,
      currentVersionId: "version-current",
    });
    lifecycleService.loadSnapshotValues = vi.fn().mockResolvedValue({ values: {}, valueMap: {} });
    lifecycleService.determineStartSection.mockResolvedValue("section-auto-advanced");

    const run = await service.createRun(
      "wf-1",
      "user-1",
      {} as any,
      undefined,
      { snapshotId: "snap-1" }
    );

    expect(lifecycleService.determineStartSection).toHaveBeenCalledWith("run-1", "wf-1", {});
    expect(logicSvc.evaluateNavigation).not.toHaveBeenCalled();
    expect(stateService.updateProgress).toHaveBeenCalledWith("run-1", "section-auto-advanced");
    expect(run.currentSectionId).toBe("section-auto-advanced");
  });

  it("initializes createAnonymousRun's currentSectionId to the first visible section", async () => {
    workflowRepo.findByPublicLink.mockResolvedValue({
      id: "wf-1",
      status: "active",
      isPublic: true,
      pinnedVersionId: null,
      currentVersionId: "version-current",
    });
    logicSvc.evaluateNavigation.mockResolvedValue({
      nextSectionId: "section-first",
      visibleSections: ["section-first"],
      visibleSteps: [],
      requiredSteps: [],
      currentProgress: 0,
    });

    const run = await service.createAnonymousRun("public-link");

    expect(logicSvc.evaluateNavigation).toHaveBeenCalledWith("wf-1", "run-1", null);
    expect(stateService.updateProgress).toHaveBeenCalledWith("run-1", "section-first");
    expect(run.currentSectionId).toBe("section-first");
  });
});
