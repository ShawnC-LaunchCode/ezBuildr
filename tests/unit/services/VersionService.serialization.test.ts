import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildTestWhen } from "../../helpers/conditionFixtures";

const TEST_TENANT_ID = "tenant-version-service-serialization-test";

const getWorkflowWithDetails = vi.fn();
const findSections = vi.fn();
const findBlocks = vi.fn();
const findDocumentHooks = vi.fn();
const findLifecycleHooks = vi.fn();

vi.mock("../../../server/services/WorkflowService", () => ({
  workflowService: { getWorkflowWithDetails },
}));

// RLS-2e: serializeWorkflow now opens a tenant-scoped transaction via
// withCurrentTenant -> db.transaction and reads via `scopedTx.query...`
// rather than `db.query...`. The stub tx exposes the same `query` object as
// `db` itself, plus a no-op `execute` (applyTenantToTransaction's GUC set).
vi.mock("../../../server/db", () => {
  const query = {
    sections: { findMany: findSections },
    blocks: { findMany: findBlocks },
    documentHooks: { findMany: findDocumentHooks },
    lifecycleHooks: { findMany: findLifecycleHooks },
  };
  return {
    db: {
      query,
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ query, execute: vi.fn().mockResolvedValue(undefined) })
      ),
    },
    initializeDatabase: vi.fn(),
  };
});

vi.mock("../../../server/services/AclService", () => ({
  aclService: { hasWorkflowRole: vi.fn().mockResolvedValue(true) },
}));

vi.mock("../../../server/services/diff/WorkflowDiffService", () => ({
  workflowDiffService: { diff: vi.fn() },
}));

describe("VersionService.serializeWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findSections.mockResolvedValue([]);
  });

  it("preserves runtime-critical workflow, logic, block, and hook fields", async () => {
    // Dynamically imported (like VersionService below) rather than a static
    // top-level import: a static import here would resolve server/utils/
    // rlsContext.ts's own `import { db } from "../db"` before this file's
    // `const findBlocks = vi.fn()` etc. run, and Vitest hoists `vi.mock`
    // factories above ordinary top-level statements — the factory would
    // then reference those consts before initialization.
    const { enterTenantContextForTests } = await import("../../../server/utils/rlsContext");
    enterTenantContextForTests(TEST_TENANT_ID);
    const conditionValue = { choices: ["yes", 2], exact: true };
    const visibleIf = { operator: "equals", alias: "approved", value: true };
    // Built once and reused for both the fixture and the assertion: `when`
    // is passed through verbatim by VersionService.
    const ruleWhen = buildTestWhen("step-1", "equals", conditionValue);

    findSections.mockResolvedValue([{
      id: "section-1",
      workflowId: "workflow-1",
      title: "Applicant information",
      description: "Identity and eligibility",
      visibleIf,
      createdAt: new Date("2026-08-23T00:00:00.000Z"),
    }]);

    getWorkflowWithDetails.mockResolvedValue({
      id: "workflow-1",
      title: "Pinned interview",
      description: "Immutable runtime definition",
      settings: { theme: "midnight", progress: "compact" },
      intakeConfig: { allowPrefill: true, completionMessage: "Done" },
      pages: [{
        id: "page-1",
        sectionId: "section-1",
        alias: "page-1",
        title: "Applicant",
        description: "Applicant details",
        order: 3,
        visibleIf,
        config: { layout: "wide" },
        steps: [{
          id: "step-1",
          pageId: "page-1",
          type: "multiple_choice",
          title: "Approved?",
          description: "Choose one",
          required: true,
          config: { options: ["yes", "no"] },
          order: 4,
          alias: "approved",
          visibleIf: { operator: "is_not_empty", alias: "email" },
          defaultValue: ["yes", 2],
        }],
      }],
      logicRules: [{
        id: "rule-1",
        conditionStepId: "step-1",
        when: ruleWhen,
        targetType: "page",
        targetPageId: "page-1",
        targetStepId: null,
        action: "show",
        order: 7,
      }],
      transformBlocks: [{
        id: "transform-1",
        workflowId: "workflow-1",
        pageId: "page-1",
        name: "Normalize",
        language: "javascript",
        code: "emit(input)",
        inputKeys: ["approved"],
        outputKey: "normalized",
        virtualStepId: "virtual-transform-1",
        phase: "onPageSubmit",
        enabled: false,
        order: 8,
        timeoutMs: 2250,
      }],
    });

    findBlocks.mockResolvedValue([{
      id: "block-1",
      workflowId: "workflow-1",
      pageId: "page-1",
      type: "webhook",
      phase: "onPageSubmit",
      config: { url: "https://example.test/hook", method: "POST" },
      virtualStepId: "virtual-block-1",
      enabled: false,
      order: 9,
    }]);
    findLifecycleHooks.mockResolvedValue([{
      id: "lifecycle-1",
      workflowId: "workflow-1",
      pageId: "page-1",
      name: "Before submit",
      phase: "beforePageSubmit",
      language: "python",
      code: "emit(data)",
      inputKeys: ["approved"],
      outputKeys: ["first", "second"],
      virtualStepIds: ["virtual-life-1", "virtual-life-2"],
      enabled: false,
      order: 10,
      timeoutMs: 3250,
      mutationMode: true,
    }]);
    findDocumentHooks.mockResolvedValue([{
      id: "document-1",
      workflowId: "workflow-1",
      finalBlockDocumentId: "document-template-1",
      name: "After document",
      phase: "afterDocument",
      language: "javascript",
      code: "emit(document)",
      inputKeys: ["normalized"],
      outputKeys: ["documentResult", "auditResult"],
      enabled: false,
      order: 11,
      timeoutMs: 4250,
    }]);

    const { VersionService } = await import("../../../server/services/VersionService");
    const result = await new VersionService().serializeWorkflow("workflow-1", "user-1");

    expect(result.settings).toEqual({ theme: "midnight", progress: "compact" });
    expect(result.intakeConfig).toEqual({ allowPrefill: true, completionMessage: "Done" });
    expect(result.sections).toEqual([{
      id: "section-1",
      title: "Applicant information",
      description: "Identity and eligibility",
      visibleIf,
    }]);
    expect(result.pages?.[0]).toMatchObject({ sectionId: "section-1", visibleIf });
    expect(result.pages?.[0]?.steps?.[0]?.defaultValue).toEqual(["yes", 2]);
    expect(result.logicRules).toEqual([expect.objectContaining({
      id: "rule-1",
      conditionStepAlias: "approved",
      when: ruleWhen,
      targetId: "page-1",
      targetAlias: "Applicant",
      order: 7,
    })]);
    expect(result.blocks).toEqual([{
      id: "block-1",
      pageId: "page-1",
      type: "webhook",
      phase: "onPageSubmit",
      config: { url: "https://example.test/hook", method: "POST" },
      virtualStepId: "virtual-block-1",
      enabled: false,
      order: 9,
    }]);
    expect(result.transformBlocks).toEqual([expect.objectContaining({
      id: "transform-1",
      pageId: "page-1",
      outputKey: "normalized",
      virtualStepId: "virtual-transform-1",
      enabled: false,
      timeoutMs: 2250,
    })]);
    expect(result.lifecycleHooks).toEqual([expect.objectContaining({
      id: "lifecycle-1",
      pageId: "page-1",
      outputAlias: "first",
      outputKeys: ["first", "second"],
      virtualStepIds: ["virtual-life-1", "virtual-life-2"],
      enabled: false,
      timeoutMs: 3250,
      mutationMode: true,
    })]);
    expect(result.documentHooks).toEqual([expect.objectContaining({
      id: "document-1",
      finalBlockDocumentId: "document-template-1",
      outputAlias: "documentResult",
      outputKeys: ["documentResult", "auditResult"],
      enabled: false,
      timeoutMs: 4250,
    })]);
  });
});
