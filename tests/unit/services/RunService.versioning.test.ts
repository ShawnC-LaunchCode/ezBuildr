import { beforeEach, describe, expect, it, vi } from "vitest";

import { RunService } from "../../../server/services/RunService";

type RunServiceArgs = ConstructorParameters<typeof RunService>;
type CreateRunInput = Parameters<RunService["createRun"]>[2];
type MockFunction = ReturnType<typeof vi.fn>;
type RunRepoMock = { create: MockFunction };
type WorkflowRepoMock = { findByPublicLink: MockFunction };
type AuthResolverMock = { verifyCreateAccess: MockFunction };
type PersistenceWriterMock = { createRun: MockFunction };
type LifecycleServiceMock = {
  loadSnapshotValues: MockFunction;
  generateRandomValues: MockFunction;
  populateInitialValues: MockFunction;
  determineStartSection: MockFunction;
  executeOnRunStart: MockFunction;
};
type MetricsServiceMock = { captureRunStarted: MockFunction };
type LogicServiceMock = { evaluateNavigation: MockFunction };
type StateServiceMock = { updateProgress: MockFunction };
type VersionServiceMock = {
  createDraftVersion: MockFunction;
  getLatestVersion: MockFunction;
};

describe("RunService version pinning", () => {
  let runRepo: RunRepoMock;
  let workflowRepo: WorkflowRepoMock;
  let authResolver: AuthResolverMock;
  let persistenceWriter: PersistenceWriterMock;
  let lifecycleService: LifecycleServiceMock;
  let metricsService: MetricsServiceMock;
  let logicSvc: LogicServiceMock;
  let stateService: StateServiceMock;
  let service: RunService;

  beforeEach(() => {
    vi.clearAllMocks();

    runRepo = {
      create: vi.fn(async (data: Record<string, unknown>) => ({ id: "run-1", ...data })),
    };
    workflowRepo = {
      findByPublicLink: vi.fn(),
    };
    authResolver = {
      verifyCreateAccess: vi.fn(),
    };
    persistenceWriter = {
      createRun: vi.fn(async (data: Record<string, unknown>) => ({ id: "run-1", ...data })),
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
      runRepo as unknown as RunServiceArgs[0],
      {} as NonNullable<RunServiceArgs[1]>,
      workflowRepo as unknown as RunServiceArgs[2],
      {} as NonNullable<RunServiceArgs[3]>,
      {} as NonNullable<RunServiceArgs[4]>,
      {} as NonNullable<RunServiceArgs[5]>,
      {} as NonNullable<RunServiceArgs[6]>,
      {} as NonNullable<RunServiceArgs[7]>,
      {} as NonNullable<RunServiceArgs[8]>,
      logicSvc as unknown as RunServiceArgs[9],
      authResolver as unknown as RunServiceArgs[10],
      {} as NonNullable<RunServiceArgs[11]>,
      persistenceWriter as unknown as RunServiceArgs[12],
      lifecycleService as unknown as RunServiceArgs[13],
      stateService as unknown as RunServiceArgs[14],
      metricsService as unknown as RunServiceArgs[15],
      {} as NonNullable<RunServiceArgs[16]>,
      {} as NonNullable<RunServiceArgs[17]>,
    );
  });

  it("rejects anonymous createRun when the workflow has no published version", async () => {
    authResolver.verifyCreateAccess.mockResolvedValue({
      id: "wf-1",
      pinnedVersionId: null,
      currentVersionId: null,
    });

    await expect(service.createRun("wf-1", undefined, {} as CreateRunInput)).rejects.toThrow(
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

    await service.createRun("wf-1", undefined, {} as CreateRunInput);

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
  let runRepo: RunRepoMock;
  let workflowRepo: WorkflowRepoMock;
  let authResolver: AuthResolverMock;
  let persistenceWriter: PersistenceWriterMock;
  let lifecycleService: LifecycleServiceMock;
  let metricsService: MetricsServiceMock;
  let logicSvc: LogicServiceMock;
  let stateService: StateServiceMock;
  let versionSvc: VersionServiceMock;
  let service: RunService;

  beforeEach(() => {
    vi.clearAllMocks();

    runRepo = {
      create: vi.fn(async (data: Record<string, unknown>) => ({ id: "run-1", ...data })),
    };
    workflowRepo = {
      findByPublicLink: vi.fn(),
    };
    authResolver = {
      verifyCreateAccess: vi.fn(),
    };
    persistenceWriter = {
      createRun: vi.fn(async (data: Record<string, unknown>) => ({ id: "run-1", ...data })),
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
      runRepo as unknown as RunServiceArgs[0],
      {} as NonNullable<RunServiceArgs[1]>,
      workflowRepo as unknown as RunServiceArgs[2],
      {} as NonNullable<RunServiceArgs[3]>,
      {} as NonNullable<RunServiceArgs[4]>,
      {} as NonNullable<RunServiceArgs[5]>,
      {} as NonNullable<RunServiceArgs[6]>,
      {} as NonNullable<RunServiceArgs[7]>,
      {} as NonNullable<RunServiceArgs[8]>,
      logicSvc as unknown as RunServiceArgs[9],
      authResolver as unknown as RunServiceArgs[10],
      {} as NonNullable<RunServiceArgs[11]>,
      persistenceWriter as unknown as RunServiceArgs[12],
      lifecycleService as unknown as RunServiceArgs[13],
      stateService as unknown as RunServiceArgs[14],
      metricsService as unknown as RunServiceArgs[15],
      {} as NonNullable<RunServiceArgs[16]>,
      {} as NonNullable<RunServiceArgs[17]>,
      versionSvc as unknown as RunServiceArgs[18],
    );
  });

  it("AC1: pins to a newly created draft version when the workflow has neither a published nor a pinned version", async () => {
    authResolver.verifyCreateAccess.mockResolvedValue({
      id: "wf-1",
      pinnedVersionId: null,
      currentVersionId: null,
    });
    versionSvc.createDraftVersion.mockResolvedValue({ id: "version-draft-new" });

    const run = await service.createRun("wf-1", "user-1", {} as CreateRunInput);

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

    const run = await service.createRun("wf-1", "user-1", {} as CreateRunInput);

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

    await service.createRun("wf-1", "user-1", {} as CreateRunInput);

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

    await expect(service.createRun("wf-1", undefined, {} as CreateRunInput)).rejects.toThrow(
      "Workflow has no published version for anonymous runs"
    );
    expect(versionSvc.createDraftVersion).not.toHaveBeenCalled();
    expect(persistenceWriter.createRun).not.toHaveBeenCalled();
  });
});

describe("RunService ICW2-B9: initial currentSectionId on run creation", () => {
  let runRepo: RunRepoMock;
  let workflowRepo: WorkflowRepoMock;
  let authResolver: AuthResolverMock;
  let persistenceWriter: PersistenceWriterMock;
  let lifecycleService: LifecycleServiceMock;
  let metricsService: MetricsServiceMock;
  let logicSvc: LogicServiceMock;
  let stateService: StateServiceMock;
  let service: RunService;

  beforeEach(() => {
    vi.clearAllMocks();

    runRepo = {
      create: vi.fn(async (data: Record<string, unknown>) => ({ id: "run-1", currentSectionId: null, ...data })),
    };
    workflowRepo = {
      findByPublicLink: vi.fn(),
    };
    authResolver = {
      verifyCreateAccess: vi.fn(),
    };
    persistenceWriter = {
      createRun: vi.fn(async (data: Record<string, unknown>) => ({ id: "run-1", currentSectionId: null, ...data })),
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
      evaluateNavigation: vi.fn(),
    };
    stateService = {
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    service = new RunService(
      runRepo as unknown as RunServiceArgs[0],
      {} as NonNullable<RunServiceArgs[1]>,
      workflowRepo as unknown as RunServiceArgs[2],
      {} as NonNullable<RunServiceArgs[3]>,
      {} as NonNullable<RunServiceArgs[4]>,
      {} as NonNullable<RunServiceArgs[5]>,
      {} as NonNullable<RunServiceArgs[6]>,
      {} as NonNullable<RunServiceArgs[7]>,
      {} as NonNullable<RunServiceArgs[8]>,
      logicSvc as unknown as RunServiceArgs[9],
      authResolver as unknown as RunServiceArgs[10],
      {} as NonNullable<RunServiceArgs[11]>,
      persistenceWriter as unknown as RunServiceArgs[12],
      lifecycleService as unknown as RunServiceArgs[13],
      stateService as unknown as RunServiceArgs[14],
      metricsService as unknown as RunServiceArgs[15],
      {} as NonNullable<RunServiceArgs[16]>,
      {} as NonNullable<RunServiceArgs[17]>,
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

    const run = await service.createRun("wf-1", "user-1", {} as CreateRunInput);

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

    const run = await service.createRun("wf-1", "user-1", {} as CreateRunInput);

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
      {} as CreateRunInput,
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
