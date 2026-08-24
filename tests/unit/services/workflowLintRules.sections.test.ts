import { describe, expect, it } from "vitest";

import { lintWorkflowContent, type LintableWorkflowContent } from "../../../server/services/workflowLintRules";

function visibleIf(variable: string): Record<string, unknown> {
  return {
    type: "group",
    id: `group-${variable}`,
    operator: "AND",
    conditions: [{
      type: "condition",
      id: `condition-${variable}`,
      variable,
      operator: "is_true",
      valueType: "constant",
    }],
  };
}

function content(sectionVisibleIf: unknown, rules: Record<string, unknown>[] = []): LintableWorkflowContent {
  return {
    sections: [{ id: "section-1", title: "Household", visibleIf: sectionVisibleIf }],
    pages: [
      { id: "intro", title: "Intro", order: 0, sectionId: null, steps: [{ id: "earlier-id", title: "Earlier", alias: "earlier" }] },
      { id: "member", title: "Member", order: 1, sectionId: "section-1", steps: [{ id: "member-id", title: "Member", alias: "member_q" }] },
      { id: "later", title: "Later", order: 2, sectionId: null, steps: [{ id: "later-id", title: "Later", alias: "later_q" }] },
    ],
    logicRules: rules,
    transformBlocks: [],
    lifecycleHooks: [],
    documentHooks: [],
  };
}

function sectionErrors(value: LintableWorkflowContent): string[] {
  return lintWorkflowContent(value)
    .filter((result) => result.type === "error" && /Section|section/.test(result.message))
    .map((result) => result.message);
}

describe("workflowLintRules — Section visibleIf", () => {
  it("allows a reference to a question on a strictly earlier page", () => {
    expect(sectionErrors(content(visibleIf("earlier")))).toEqual([]);
  });

  it.each(["member_q", "later_q"])("rejects same-Section or later-page reference %s", (alias) => {
    expect(sectionErrors(content(visibleIf(alias)))).toContainEqual(
      expect.stringContaining("before the Section")
    );
  });

  it("rejects a dangling Section operand through the existing dependency graph", () => {
    expect(sectionErrors(content(visibleIf("deleted_alias")))).toContainEqual(
      expect.stringContaining('unknown alias: "deleted_alias"')
    );
  });

  it("applies ordering checks to right-hand variable operands", () => {
    const expression = visibleIf("earlier");
    const leaf = (expression.conditions as Array<Record<string, unknown>>)[0];
    leaf.valueType = "variable";
    leaf.value = "later_q";

    expect(sectionErrors(content(expression))).toContainEqual(expect.stringContaining('"later_q"'));
  });

  it("rejects script conditions without attempting dependency inference", () => {
    expect(sectionErrors(content({
      type: "group",
      id: "script-group",
      operator: "AND",
      conditions: [{ type: "script", id: "script", code: "return true" }],
    }))).toContainEqual(expect.stringContaining("script conditions"));
  });

  it("rejects skip_to into a conditional Section with an actionable message", () => {
    const rules = [{
      id: "skip",
      conditionStepId: "earlier-id",
      when: visibleIf("earlier"),
      targetType: "page",
      targetId: "member",
      action: "skip_to",
      order: 1,
    }];
    expect(sectionErrors(content(visibleIf("earlier"), rules))).toContainEqual(
      expect.stringContaining("Target an ungrouped page or a page in an unconditional Section")
    );
  });

  it.each([null, { type: "group", id: "empty", operator: "AND", conditions: [] }])(
    "allows skip_to into an unconditional or empty-condition Section",
    (sectionVisibleIf) => {
      const rules = [{
        id: "skip",
        conditionStepId: "earlier-id",
        when: visibleIf("earlier"),
        targetType: "page",
        targetId: "member",
        action: "skip_to",
        order: 1,
      }];
      expect(sectionErrors(content(sectionVisibleIf, rules))).toEqual([]);
    }
  );

  it("allows skip_to to an ungrouped page even when another Section is conditional", () => {
    const rules = [{
      id: "skip",
      conditionStepId: "earlier-id",
      when: visibleIf("earlier"),
      targetType: "page",
      targetId: "later",
      action: "skip_to",
      order: 1,
    }];
    expect(sectionErrors(content(visibleIf("earlier"), rules))).toEqual([]);
  });
});
