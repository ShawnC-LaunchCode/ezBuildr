import { describe, expect, it } from "vitest";

import { versionService } from "../../../server/services/VersionService";
import { validateWorkflowStructure } from "../../../server/services/workflowStructureRules";
import type { WorkflowGraph } from "../../../shared/zod-schemas.js";

const PAGE_A = "11111111-1111-4111-8111-111111111111";
const PAGE_B = "22222222-2222-4222-8222-222222222222";
const STEP_1 = "33333333-3333-4333-8333-333333333333";
const STEP_2 = "44444444-4444-4444-8444-444444444444";

function errorsOf(data: Parameters<typeof validateWorkflowStructure>[0]): string[] {
  return validateWorkflowStructure(data).filter(r => r.type === "error").map(r => r.message);
}

type TestStep = Record<string, unknown>;
type TestPage = { id: string; title: string; order: number; steps: TestStep[] };
type TestWorkflow = { pages: TestPage[]; logicRules: Record<string, unknown>[] };

/** A minimal workflow that passes every structural check. */
function validWorkflow(): TestWorkflow {
  return {
    pages: [
      {
        id: PAGE_A,
        title: "Page 1",
        order: 0,
        steps: [{ id: STEP_1, type: "short_text", title: "Your name", alias: "name", required: true }],
      },
      {
        id: PAGE_B,
        title: "Page 2",
        order: 1,
        steps: [{ id: STEP_2, type: "short_text", title: "Your city", alias: "city" }],
      },
    ],
    logicRules: [],
  };
}

describe("validateWorkflowStructure (RUN2-9)", () => {
  it("passes a well-formed workflow", () => {
    expect(errorsOf(validWorkflow())).toEqual([]);
  });

  describe("check 1 — workflow has content", () => {
    it("rejects a workflow with no pages", () => {
      expect(errorsOf({ pages: [] })).toContain("Workflow must have at least one page.");
    });

    it("rejects a page with no questions", () => {
      const data = { pages: [{ id: PAGE_A, title: "Page 1", order: 0, steps: [] }] };
      expect(errorsOf(data)).toContain("Workflow must have at least one question.");
    });

    it("does not count a virtual step as a question", () => {
      const data = {
        pages: [{
          id: PAGE_A, title: "Page 1", order: 0,
          steps: [{ id: STEP_1, type: "computed", title: "calc", isVirtual: true }],
        }],
      };
      expect(errorsOf(data)).toContain("Workflow must have at least one question.");
    });
  });

  describe("check 2 — ids are UUIDs", () => {
    it("rejects a non-UUID page id", () => {
      const data = validWorkflow();
      data.pages[0].id = "page-one";
      expect(errorsOf(data).join(" ")).toMatch(/Page "Page 1" has an id that is not a UUID/);
    });

    it("rejects a non-UUID step id", () => {
      const data = validWorkflow();
      data.pages[0].steps[0].id = "step-one";
      expect(errorsOf(data).join(" ")).toMatch(/Question "Your name" has an id that is not a UUID/);
    });
  });

  describe("check 3 — step types are real", () => {
    it("rejects a type that is not in stepTypeEnum", () => {
      const data = validWorkflow();
      data.pages[0].steps[0].type = "checkbox";
      expect(errorsOf(data).join(" ")).toMatch(/has an unrecognized type: "checkbox"/);
    });
  });

  describe("check 4 — every respondent-facing question is answerable", () => {
    it("allows a required file upload now that the runner renders it", () => {
      const data = validWorkflow();
      data.pages[0].steps[0].type = "file_upload";
      expect(errorsOf(data)).toEqual([]);
    });

    it("allows an optional file upload too", () => {
      const data = validWorkflow();
      data.pages[0].steps[0].type = "file_upload";
      data.pages[0].steps[0].required = false;
      expect(errorsOf(data)).toEqual([]);
    });
  });

  describe("check 5 — skip_to points forward", () => {
    it("rejects a skip_to targeting the page that holds its own condition", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "skip_to", targetType: "page", targetId: PAGE_A,
        conditionStepId: STEP_1, operator: "equals", conditionValue: "yes",
      }];
      // Repo owner's ruling (2026-08-08): the old "would loop the interview
      // forever" wording was false — isForwardSkipTarget (RUN2-2) discards a
      // backward-or-equal skip at run time, so it never loops, it just never
      // fires. The message now says that, and names reordering as the likely
      // cause, since PageService.reorderPages validates nothing and can
      // silently turn a working forward rule into a dead one.
      expect(errorsOf(data).join(" ")).toMatch(/can never fire/i);
      expect(errorsOf(data).join(" ")).not.toMatch(/loop/i);
    });

    it("allows a forward skip_to", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "skip_to", targetType: "page", targetId: PAGE_B,
        conditionStepId: STEP_1, operator: "equals", conditionValue: "yes",
      }];
      expect(errorsOf(data)).toEqual([]);
    });

    it("stays an error and still blocks VersionService.validateWorkflow's publish gate (pinned so a later refactor cannot quietly downgrade it)", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "skip_to", targetType: "page", targetId: PAGE_A,
        conditionStepId: STEP_1, operator: "equals", conditionValue: "yes",
      }];

      const structuralErrors = validateWorkflowStructure(data).filter((r) => r.type === "error");
      expect(structuralErrors.some((r) => /can never fire/i.test(r.message))).toBe(true);

      const graph = { ...data, title: "Backward skip only" } as unknown as WorkflowGraph;
      const validation = versionService.validateWorkflow("irrelevant-workflow-id", graph);
      expect(validation.valid).toBe(false);
      expect(validation.errors.join(" ")).toMatch(/can never fire/i);
    });
  });

  describe("check 6 — logic rules resolve", () => {
    it("rejects a rule with no condition question", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "hide", targetType: "page", targetId: PAGE_B,
        conditionStepId: "", operator: "is_empty",
      }];
      expect(errorsOf(data).join(" ")).toMatch(/has no condition question, so it would always fire/);
    });

    it("rejects a rule whose condition question does not exist", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "hide", targetType: "page", targetId: PAGE_B,
        conditionStepId: "99999999-9999-4999-8999-999999999999", operator: "equals",
      }];
      expect(errorsOf(data).join(" ")).toMatch(/condition references a question that does not exist/);
    });

    it("rejects a rule whose target does not exist", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "hide", targetType: "page", targetId: "99999999-9999-4999-8999-999999999999",
        conditionStepId: STEP_1, operator: "equals",
      }];
      expect(errorsOf(data).join(" ")).toMatch(/target references a page that does not exist/);
    });

    it("rejects a rule with no target at all", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "hide", targetType: "page", conditionStepId: STEP_1, operator: "equals",
      }];
      expect(errorsOf(data).join(" ")).toMatch(/has no target, so it can never take effect/);
    });
  });

  describe("check 7 — choice questions are answerable", () => {
    it("rejects a choice question with no options", () => {
      const data = validWorkflow();
      data.pages[0].steps[0] = {
        id: STEP_1, type: "choice", title: "Pick one", alias: "pick", required: true,
        config: { options: [] },
      };
      expect(errorsOf(data).join(" ")).toMatch(/has no options and no dynamic option source/);
    });

    it("rejects an unsupported display mode", () => {
      const data = validWorkflow();
      data.pages[0].steps[0] = {
        id: STEP_1, type: "choice", title: "Pick one", alias: "pick",
        config: { options: [{ id: "a", label: "A" }], display: "grid" },
      };
      expect(errorsOf(data).join(" ")).toMatch(/unsupported display mode: "grid"/);
    });

    it("accepts a dynamic option source with no static options", () => {
      const data = validWorkflow();
      data.pages[0].steps[0] = {
        id: STEP_1, type: "choice", title: "Pick one", alias: "pick",
        config: { options: { type: "table_column", tableId: "t", columnId: "c" }, display: "dropdown" },
      };
      expect(errorsOf(data)).toEqual([]);
    });

    it("accepts a legacy multiple_choice question with a plain string option list", () => {
      const data = validWorkflow();
      data.pages[0].steps[0] = {
        id: STEP_1, type: "multiple_choice", title: "Pick some", alias: "pick",
        config: { options: ["A", "B"] },
      };
      expect(errorsOf(data)).toEqual([]);
    });
  });

  describe("warnings do not block", () => {
    it("warns, but does not error, on a required question with a visibility condition", () => {
      const data = validWorkflow();
      data.pages[0].steps[0].visibleIf = { type: "group", operator: "AND", conditions: [] };
      const results = validateWorkflowStructure(data);
      expect(results.filter(r => r.type === "error")).toEqual([]);
      expect(results.filter(r => r.type === "warning").map(r => r.message).join(" "))
        .toMatch(/only required while visible/);
    });
  });
});
