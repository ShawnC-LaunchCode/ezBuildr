import { describe, expect, it } from "vitest";

import { validateWorkflowStructure } from "../../../server/services/workflowStructureRules";

const SECTION_A = "11111111-1111-4111-8111-111111111111";
const SECTION_B = "22222222-2222-4222-8222-222222222222";
const STEP_1 = "33333333-3333-4333-8333-333333333333";
const STEP_2 = "44444444-4444-4444-8444-444444444444";

function errorsOf(data: Parameters<typeof validateWorkflowStructure>[0]): string[] {
  return validateWorkflowStructure(data).filter(r => r.type === "error").map(r => r.message);
}

type TestStep = Record<string, unknown>;
type TestSection = { id: string; title: string; order: number; steps: TestStep[] };
type TestWorkflow = { sections: TestSection[]; logicRules: Record<string, unknown>[] };

/** A minimal workflow that passes every structural check. */
function validWorkflow(): TestWorkflow {
  return {
    sections: [
      {
        id: SECTION_A,
        title: "Page 1",
        order: 0,
        steps: [{ id: STEP_1, type: "short_text", title: "Your name", alias: "name", required: true }],
      },
      {
        id: SECTION_B,
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
    it("rejects a workflow with no sections", () => {
      expect(errorsOf({ sections: [] })).toContain("Workflow must have at least one section.");
    });

    it("rejects a section with no questions", () => {
      const data = { sections: [{ id: SECTION_A, title: "Page 1", order: 0, steps: [] }] };
      expect(errorsOf(data)).toContain("Workflow must have at least one question.");
    });

    it("does not count a virtual step as a question", () => {
      const data = {
        sections: [{
          id: SECTION_A, title: "Page 1", order: 0,
          steps: [{ id: STEP_1, type: "computed", title: "calc", isVirtual: true }],
        }],
      };
      expect(errorsOf(data)).toContain("Workflow must have at least one question.");
    });
  });

  describe("check 2 — ids are UUIDs", () => {
    it("rejects a non-UUID section id", () => {
      const data = validWorkflow();
      data.sections[0].id = "section-one";
      expect(errorsOf(data).join(" ")).toMatch(/Section "Page 1" has an id that is not a UUID/);
    });

    it("rejects a non-UUID step id", () => {
      const data = validWorkflow();
      data.sections[0].steps[0].id = "step-one";
      expect(errorsOf(data).join(" ")).toMatch(/Question "Your name" has an id that is not a UUID/);
    });
  });

  describe("check 3 — step types are real", () => {
    it("rejects a type that is not in stepTypeEnum", () => {
      const data = validWorkflow();
      data.sections[0].steps[0].type = "checkbox";
      expect(errorsOf(data).join(" ")).toMatch(/has an unrecognized type: "checkbox"/);
    });
  });

  describe("check 4 — nothing unanswerable is required", () => {
    it("rejects a required question the runner cannot render", () => {
      const data = validWorkflow();
      data.sections[0].steps[0].type = "file_upload";
      expect(errorsOf(data).join(" ")).toMatch(/is required but its type \("file_upload"\) cannot be answered/);
    });

    it("allows the same type when it is not required", () => {
      const data = validWorkflow();
      data.sections[0].steps[0].type = "file_upload";
      data.sections[0].steps[0].required = false;
      expect(errorsOf(data)).toEqual([]);
    });
  });

  describe("check 5 — skip_to points forward", () => {
    it("rejects a skip_to targeting the section that holds its own condition", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "skip_to", targetType: "section", targetId: SECTION_A,
        conditionStepId: STEP_1, operator: "equals", conditionValue: "yes",
      }];
      expect(errorsOf(data).join(" ")).toMatch(/would loop the interview forever/);
    });

    it("allows a forward skip_to", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "skip_to", targetType: "section", targetId: SECTION_B,
        conditionStepId: STEP_1, operator: "equals", conditionValue: "yes",
      }];
      expect(errorsOf(data)).toEqual([]);
    });
  });

  describe("check 6 — logic rules resolve", () => {
    it("rejects a rule with no condition question", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "hide", targetType: "section", targetId: SECTION_B,
        conditionStepId: "", operator: "is_empty",
      }];
      expect(errorsOf(data).join(" ")).toMatch(/has no condition question, so it would always fire/);
    });

    it("rejects a rule whose condition question does not exist", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "hide", targetType: "section", targetId: SECTION_B,
        conditionStepId: "99999999-9999-4999-8999-999999999999", operator: "equals",
      }];
      expect(errorsOf(data).join(" ")).toMatch(/condition references a question that does not exist/);
    });

    it("rejects a rule whose target does not exist", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "hide", targetType: "section", targetId: "99999999-9999-4999-8999-999999999999",
        conditionStepId: STEP_1, operator: "equals",
      }];
      expect(errorsOf(data).join(" ")).toMatch(/target references a section that does not exist/);
    });

    it("rejects a rule with no target at all", () => {
      const data = validWorkflow();
      data.logicRules = [{
        action: "hide", targetType: "section", conditionStepId: STEP_1, operator: "equals",
      }];
      expect(errorsOf(data).join(" ")).toMatch(/has no target, so it can never take effect/);
    });
  });

  describe("check 7 — choice questions are answerable", () => {
    it("rejects a choice question with no options", () => {
      const data = validWorkflow();
      data.sections[0].steps[0] = {
        id: STEP_1, type: "choice", title: "Pick one", alias: "pick", required: true,
        config: { options: [] },
      };
      expect(errorsOf(data).join(" ")).toMatch(/has no options and no dynamic option source/);
    });

    it("rejects an unsupported display mode", () => {
      const data = validWorkflow();
      data.sections[0].steps[0] = {
        id: STEP_1, type: "choice", title: "Pick one", alias: "pick",
        config: { options: [{ id: "a", label: "A" }], display: "grid" },
      };
      expect(errorsOf(data).join(" ")).toMatch(/unsupported display mode: "grid"/);
    });

    it("accepts a dynamic option source with no static options", () => {
      const data = validWorkflow();
      data.sections[0].steps[0] = {
        id: STEP_1, type: "choice", title: "Pick one", alias: "pick",
        config: { options: { type: "table_column", tableId: "t", columnId: "c" }, display: "dropdown" },
      };
      expect(errorsOf(data)).toEqual([]);
    });

    it("accepts a legacy multiple_choice question with a plain string option list", () => {
      const data = validWorkflow();
      data.sections[0].steps[0] = {
        id: STEP_1, type: "multiple_choice", title: "Pick some", alias: "pick",
        config: { options: ["A", "B"] },
      };
      expect(errorsOf(data)).toEqual([]);
    });
  });

  describe("warnings do not block", () => {
    it("warns, but does not error, on a required question with a visibility condition", () => {
      const data = validWorkflow();
      data.sections[0].steps[0].visibleIf = { type: "group", operator: "AND", conditions: [] };
      const results = validateWorkflowStructure(data);
      expect(results.filter(r => r.type === "error")).toEqual([]);
      expect(results.filter(r => r.type === "warning").map(r => r.message).join(" "))
        .toMatch(/only required while visible/);
    });
  });
});
