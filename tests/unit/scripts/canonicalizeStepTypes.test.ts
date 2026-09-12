import { describe, expect, it } from "vitest";

import { canonicalizeGraphJson } from "../../../scripts/canonicalizeStepTypes";

// STB-B14 (CLN-4): production's `workflow_versions.graph_json` is 57/58 rows in
// a pre-migration-0038 shape where the table 0038 renamed to `pages` was called
// `sections` and held `steps[]` directly — NOT today's `sections`, which is a
// later, unrelated metadata-only group layer that always coexists with `pages`.
// `canonicalizeGraphJson` used to treat any graph without a `pages` key as one
// opaque "unrecognized shape" bucket, so this legacy `sections[].steps[]` shape
// counted as neither converted nor unconverted and `--audit` passed over 56
// rows still holding legacy type names. These tests are pure-fixture: no DB,
// per the `run-tests` skill and the ticket's `Ties`.

function legacySectionsGraph() {
  return {
    title: "Legacy pre-pages-split workflow",
    projectId: "project-1",
    settings: {},
    intakeConfig: {},
    // NOTE: no `pages` key at all — this is the discriminator for the legacy shape.
    sections: [
      {
        id: "section-1",
        title: "Section one",
        order: 0,
        steps: [
          {
            id: "step-1",
            type: "yes_no",
            title: "Do you agree?",
            alias: "agree",
            order: 0,
            config: { yesLabel: "Yes", noLabel: "No" },
          },
          {
            id: "step-2",
            type: "short_text",
            title: "Your name",
            alias: "name",
            order: 1,
            config: { placeholder: "Name" },
          },
        ],
      },
      {
        id: "section-2",
        title: "Section two",
        order: 1,
        steps: [
          {
            id: "step-3",
            type: "currency",
            title: "Amount",
            alias: "amount",
            order: 0,
            config: { currency: "USD" },
          },
        ],
      },
    ],
    logicRules: [],
    lifecycleHooks: [],
    documentHooks: [],
  };
}

function modernGraph() {
  return {
    title: "Modern workflow",
    projectId: "project-1",
    settings: {},
    intakeConfig: {},
    // Today's `sections[]`: metadata-only group layer, coexists with `pages`,
    // and must be preserved byte-for-byte when `pages` is present.
    sections: [
      { id: "group-1", title: "Group one", description: "A group", visibleIf: null },
    ],
    pages: [
      {
        id: "page-1",
        sectionId: "group-1",
        title: "Page one",
        order: 0,
        config: {},
        steps: [
          {
            id: "step-1",
            type: "text",
            title: "Already canonical",
            alias: "already_canonical",
            order: 0,
            config: { variant: "short" },
          },
        ],
      },
    ],
    logicRules: [],
    lifecycleHooks: [],
    documentHooks: [],
  };
}

describe("CLN-4 canonicalizeGraphJson: legacy sections[].steps[] and modern pages[]/sections[]", () => {
  it("converts a legacy sections[].steps[] graph (no pages key) into pages[].steps[] with canonical types", () => {
    const result = canonicalizeGraphJson(legacySectionsGraph());

    expect(result.legacySectionsMigrated).toBe(2);
    expect(result.definitionsProcessed).toBe(3);
    expect(result.definitionsChanged).toBe(3);

    const converted = result.graphJson as Record<string, unknown>;
    // The container is renamed, not merged: no `sections` key survives.
    expect(converted).not.toHaveProperty("sections");
    expect(Array.isArray(converted.pages)).toBe(true);

    const pages = converted.pages as Array<{ id: string; steps: Array<{ type: string; alias: string }> }>;
    expect(pages).toHaveLength(2);
    expect(pages[0].id).toBe("section-1");
    expect(pages[0].steps.map((s) => s.type)).toEqual(["boolean", "text"]);
    // `currency` is a legacy alias for the canonical `number` type (currency
    // mode), not a canonical type of its own -- see LEGACY_STEP_ADAPTERS.
    expect(pages[1].steps.map((s) => s.type)).toEqual(["number"]);

    expect(result.oldToNewTypeCounts).toMatchObject({
      "yes_no -> boolean": 1,
      "short_text -> text": 1,
      "currency -> number": 1,
    });
  });

  it("throws nothing and preserves alias/title/order on migrated steps", () => {
    const result = canonicalizeGraphJson(legacySectionsGraph());
    const converted = result.graphJson as { pages: Array<{ steps: Array<Record<string, unknown>> }> };
    const firstStep = converted.pages[0].steps[0];
    expect(firstStep.alias).toBe("agree");
    expect(firstStep.title).toBe("Do you agree?");
    expect(firstStep.order).toBe(0);
  });

  it("leaves a modern graph (has pages[], metadata-only sections[]) completely unchanged", () => {
    const input = modernGraph();
    const result = canonicalizeGraphJson(input);

    expect(result.legacySectionsMigrated).toBe(0);
    expect(result.definitionsChanged).toBe(0);
    expect(result.unrecognizedShape).toBe(false);
    // Nothing changed, so the converter must hand back the ORIGINAL object,
    // sections included and untouched -- not a stripped/rebuilt clone.
    expect(result.graphJson).toBe(input);
    expect((result.graphJson as { sections: unknown[] }).sections).toEqual(input.sections);
  });

  it("still reports an unrecognized shape with real step-like content as unconverted (fails --audit)", () => {
    // Neither `pages` nor a steps-bearing `sections[]` -- the genuinely
    // unrecognized top-level `blocks[]` shape from before the pages/steps split.
    const result = canonicalizeGraphJson({
      title: "old",
      blocks: [
        { id: "b1", type: "short_text", title: "Name" },
        { id: "b2", type: "yes_no", title: "Agree" },
      ],
    });

    expect(result.unrecognizedShape).toBe(true);
    expect(result.legacySectionsMigrated).toBe(0);
    expect(result.unconvertedDefinitions).toBe(2);
    // Untouched: the converter reports the shape, it does not guess at it.
    expect(result.graphJson).toEqual({
      title: "old",
      blocks: [
        { id: "b1", type: "short_text", title: "Name" },
        { id: "b2", type: "yes_no", title: "Agree" },
      ],
    });
  });

  it("does not mistake an empty sections[] for the legacy shape (no entries carry steps[])", () => {
    // Regression guard for the pre-existing STB-20 fixture in
    // tests/integration/canonicalizeStepTypes.artifacts.test.ts: `sections: []`
    // with no `pages` key has no entries to satisfy "carries a steps[] array",
    // so it must still fall through to the unrecognized-shape branch exactly
    // as before this ticket, not be silently treated as a zero-entry legacy migration.
    const result = canonicalizeGraphJson({ title: "old", sections: [], blocks: [] });

    expect(result.unrecognizedShape).toBe(true);
    expect(result.legacySectionsMigrated).toBe(0);
    expect(result.unconvertedDefinitions).toBe(0);
    expect(result.definitionsChanged).toBe(0);
  });
});
