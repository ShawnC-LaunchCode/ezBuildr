// @vitest-environment jsdom
/**
 * LIST2-5 — `ListDrillEditor` must thread `aliasMap` down to every
 * `BlockRenderer` it renders, mirroring how `SectionSteps.tsx` obtains and
 * forwards it. Without it, a `choice` field inside a list item whose
 * dynamic options resolve through an aliased list variable silently gets no
 * options (AC1/AC2). Absent an `aliasMap`, resolution must degrade to no
 * options rather than throw (AC3).
 */
import { useEffect } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ListDrillEditor } from "@/components/runner/list/ListDrillEditor";
import { ListDrillProvider, useListDrill } from "@/components/runner/list/ListDrillContext";
import type { ApiStep } from "@/lib/vault-api";
import type { ListValue } from "@shared/types/stepConfigs";

function makeListStep(): ApiStep {
  return {
    id: "step-list-1",
    workflowId: "wf-1",
    sectionId: "sec-1",
    type: "list",
    title: "Team",
    description: null,
    required: false,
    alias: "team",
    order: 1,
    isVirtual: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    config: {
      fields: [
        {
          kind: "question",
          id: "field-choice-1",
          alias: "manager_choice",
          type: "choice",
          title: "Manager",
          order: 0,
          config: {
            display: "dropdown",
            allowMultiple: false,
            options: {
              type: "list",
              listVariable: "team_members",
              labelPath: "",
              valuePath: "",
              labelTemplate: "{first_name} {last_name}",
            },
          },
        },
      ],
    },
  } as unknown as ApiStep;
}

function makeRootValue(): ListValue {
  return {
    items: [
      {
        itemId: "item-1",
        values: {
          manager_choice: undefined,
          // Keyed differently than the choice field's own `listVariable`
          // ("team_members") on purpose — only the aliasMap fallback
          // (team_members -> team_members_step_id) can resolve this, so a
          // passing test proves the map was actually forwarded and used.
          team_members_step_id: {
            items: [
              { itemId: "a", values: { first_name: "Ava", last_name: "Lee" } },
              { itemId: "b", values: { first_name: "Bo", last_name: "Kim" } },
            ],
          },
        },
      },
    ],
  };
}

function Harness({ aliasMap }: { aliasMap?: Record<string, string> }) {
  const { drill, enterList } = useListDrill();
  const step = makeListStep();
  const value = makeRootValue();

  useEffect(() => {
    if (!drill) {
      enterList(step.id, { fieldAlias: null, itemId: "item-1", label: "Item 1" });
    }
  }, [drill, enterList, step.id]);

  if (!drill) {
    return null;
  }

  return (
    <ListDrillEditor
      step={step}
      value={value}
      onChange={() => undefined}
      drill={drill}
      aliasMap={aliasMap}
    />
  );
}

function renderHarness(aliasMap?: Record<string, string>) {
  return render(
    <ListDrillProvider>
      <Harness aliasMap={aliasMap} />
    </ListDrillProvider>
  );
}

describe("ListDrillEditor — LIST2-5 aliasMap threading", () => {
  beforeAll(() => {
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false;
    }
    if (!Element.prototype.releasePointerCapture) {
      Element.prototype.releasePointerCapture = () => undefined;
    }
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => undefined;
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("AC2: resolves a list-bound choice field's options when aliasMap is supplied", async () => {
    renderHarness({ team_members: "team_members_step_id" });

    const trigger = await screen.findByRole("combobox");
    const user = userEvent.setup();
    await user.click(trigger);

    expect(await screen.findByRole("option", { name: "Ava Lee" })).toBeDefined();
    expect(await screen.findByRole("option", { name: "Bo Kim" })).toBeDefined();
  });

  it("AC3: degrades to no options, without throwing, when aliasMap is absent", async () => {
    expect(() => renderHarness(undefined)).not.toThrow();

    // With no aliasMap, `team_members` can't resolve to the field keyed under
    // `team_members_step_id`, so the dropdown has zero options — no
    // combobox trigger renders at all, and the block shows its normal empty
    // state rather than throwing.
    await waitFor(() => {
      expect(screen.getByText("No options available")).toBeDefined();
    });
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

/**
 * AC4, added by the reviewer once LIST2-3's `normalizeListConfig` landed —
 * the dev correctly reported this blocked rather than writing a second copy
 * of the helper. `step.config` is jsonb, so a row predating LIST2-3's schema
 * (or any bypass of it) can be malformed; `ListDrillEditor` must degrade to
 * an empty list instead of throwing on `[...config.fields]`.
 */
describe("ListDrillEditor — LIST2-5 AC4 malformed config", () => {
  afterEach(() => {
    cleanup();
  });

  function MalformedHarness({ config }: { config: unknown }) {
    const { drill, enterList } = useListDrill();
    const step = { ...makeListStep(), config } as unknown as ApiStep;

    useEffect(() => {
      if (!drill) {
        enterList(step.id, { fieldAlias: null, itemId: "item-1", label: "Item 1" });
      }
    }, [drill, enterList, step.id]);

    if (!drill) {
      return null;
    }

    return (
      <ListDrillEditor step={step} value={makeRootValue()} onChange={() => undefined} drill={drill} />
    );
  }

  it.each([
    ["null", null],
    ["a bare string", "not-a-config"],
    ["an object with no fields array", {}],
  ])("renders an empty item editor instead of throwing when config is %s", async (_label, config) => {
    expect(() => render(
      <ListDrillProvider>
        <MalformedHarness config={config} />
      </ListDrillProvider>
    )).not.toThrow();

    // The drill still opens (breadcrumb renders) — it just has no fields,
    // rather than the whole section body crashing.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Done" })).toBeDefined();
    });
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
