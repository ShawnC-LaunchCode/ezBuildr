// @vitest-environment jsdom
/**
 * LIST-12 AC6 — Missing-state rendering for list-step-backed choices.
 *
 * When an item in a list step is deleted, any choice question bound to that list
 * holding the deleted item's stable `itemId` must render a clearly-labelled
 * missing state ("(Deleted item)") rather than silently appearing blank/unanswered.
 *
 * This test suite renders the real `ChoiceBlockRenderer` against jsdom and asserts
 * on the exact DOM seen by respondents across dropdown, radio, and multiple display modes.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ChoiceBlockRenderer } from "@/components/runner/blocks/ChoiceBlock";

import type { Step } from "@/types";
import type { DynamicOptionsConfig } from "@shared/types/stepConfigs";

function makeListChoiceStep(display: "dropdown" | "radio" | "multiple" | "combobox", allowMultiple = false): Step {
  const dynamicConfig: DynamicOptionsConfig = {
    type: "list",
    listVariable: "team_members",
    labelPath: "",
    valuePath: "",
    labelTemplate: "{first_name} {last_name}",
  };

  return {
    id: "step-choice-1",
    workflowId: "wf-1",
    sectionId: "sec-1",
    type: "choice",
    title: "Select team member",
    description: null,
    required: false,
    alias: "selected_member",
    order: 2,
    isVirtual: false,
    config: {
      display,
      allowMultiple,
      options: dynamicConfig,
    },
    createdAt: "2026-08-01T00:00:00.000Z",
  } as unknown as Step;
}

function makeQueryBlockChoiceStep(display: "dropdown" = "dropdown"): Step {
  const dynamicConfig: DynamicOptionsConfig = {
    type: "list",
    listVariable: "query_results",
    labelPath: "name",
    valuePath: "id",
  };

  return {
    id: "step-query-choice",
    workflowId: "wf-1",
    sectionId: "sec-1",
    type: "choice",
    title: "Select from query",
    description: null,
    required: false,
    alias: "selected_row",
    order: 2,
    isVirtual: false,
    config: {
      display,
      options: dynamicConfig,
    },
    createdAt: "2026-08-01T00:00:00.000Z",
  } as unknown as Step;
}

function makeStaticChoiceStep(display: "dropdown" = "dropdown"): Step {
  return {
    id: "step-static-choice",
    workflowId: "wf-1",
    sectionId: "sec-1",
    type: "choice",
    title: "Select static option",
    description: null,
    required: false,
    alias: "selected_static",
    order: 2,
    isVirtual: false,
    config: {
      display,
      options: [
        { id: "opt-1", label: "Alpha", alias: "opt-1" },
        { id: "opt-2", label: "Beta", alias: "opt-2" },
      ],
    },
    createdAt: "2026-08-01T00:00:00.000Z",
  } as unknown as Step;
}

describe("ChoiceBlockRenderer — LIST-12 AC6 missing-state rendering for list-step dynamic options", () => {
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

  it("renders clearly-labelled missing state in dropdown trigger when referenced item was deleted", async () => {
    const onChange = vi.fn();
    const step = makeListChoiceStep("dropdown");

    // List step currently only has Bob (Alice was deleted)
    const context = {
      team_members: {
        items: [
          {
            itemId: "item-bob-uuid",
            values: { first_name: "Bob", last_name: "Jones" },
          },
        ],
      },
    };

    // Stored selection was Alice ("item-alice-uuid")
    render(
      <ChoiceBlockRenderer
        step={step}
        value="item-alice-uuid"
        onChange={onChange}
        context={context}
      />
    );

    // Dropdown trigger must display "(Deleted item)" rather than blank placeholder
    await waitFor(() => {
      expect(screen.getByText("(Deleted item)")).toBeDefined();
    });

    const trigger = screen.getByRole("combobox");
    expect(trigger.textContent).toContain("(Deleted item)");
    expect(trigger.textContent).not.toContain("Select an option...");
  });

  it("renders missing state in dropdown even when all items in source list were deleted", async () => {
    const onChange = vi.fn();
    const step = makeListChoiceStep("dropdown");

    // All items deleted from list step
    const context = {
      team_members: {
        items: [],
      },
    };

    render(
      <ChoiceBlockRenderer
        step={step}
        value="item-alice-uuid"
        onChange={onChange}
        context={context}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("(Deleted item)")).toBeDefined();
    });

    const trigger = screen.getByRole("combobox");
    expect(trigger.textContent).toContain("(Deleted item)");
  });

  it("renders checked missing radio option when referenced item was deleted", async () => {
    const onChange = vi.fn();
    const step = makeListChoiceStep("radio");

    const context = {
      team_members: {
        items: [
          {
            itemId: "item-bob-uuid",
            values: { first_name: "Bob", last_name: "Jones" },
          },
        ],
      },
    };

    render(
      <ChoiceBlockRenderer
        step={step}
        value="item-alice-uuid"
        onChange={onChange}
        context={context}
      />
    );

    // Both the surviving option "Bob Jones" and missing option "(Deleted item)" appear
    await waitFor(() => {
      expect(screen.getByText("Bob Jones")).toBeDefined();
      expect(screen.getByText("(Deleted item)")).toBeDefined();
    });

    const deletedRadio = screen.getByRole("radio", { name: "(Deleted item)" });
    expect(deletedRadio.getAttribute("data-state")).toBe("checked");
  });

  it("renders checked missing checkbox when referenced item was deleted in multiple-choice mode", async () => {
    const onChange = vi.fn();
    const step = makeListChoiceStep("multiple", true);

    const context = {
      team_members: {
        items: [
          {
            itemId: "item-bob-uuid",
            values: { first_name: "Bob", last_name: "Jones" },
          },
        ],
      },
    };

    // Stored selection has both Bob and the deleted Alice
    render(
      <ChoiceBlockRenderer
        step={step}
        value={["item-alice-uuid", "item-bob-uuid"]}
        onChange={onChange}
        context={context}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Bob Jones")).toBeDefined();
      expect(screen.getByText("(Deleted item)")).toBeDefined();
    });

    const bobCheckbox = screen.getByRole("checkbox", { name: "Bob Jones" });
    const deletedCheckbox = screen.getByRole("checkbox", { name: "(Deleted item)" });

    expect(bobCheckbox.getAttribute("data-state")).toBe("checked");
    expect(deletedCheckbox.getAttribute("data-state")).toBe("checked");
  });

  it("re-selecting a surviving option calls onChange and replaces the selection", async () => {
    const onChange = vi.fn();
    const step = makeListChoiceStep("dropdown");

    const context = {
      team_members: {
        items: [
          {
            itemId: "item-bob-uuid",
            values: { first_name: "Bob", last_name: "Jones" },
          },
        ],
      },
    };

    render(
      <ChoiceBlockRenderer
        step={step}
        value="item-alice-uuid"
        onChange={onChange}
        context={context}
      />
    );

    const trigger = await screen.findByRole("combobox");
    const user = userEvent.setup();
    await user.click(trigger);

    const bobOption = await screen.findByRole("option", { name: "Bob Jones" });
    await user.click(bobOption);

    expect(onChange).toHaveBeenCalledWith("item-bob-uuid");
  });

  it("AC3 & AC8: static- and query-block-sourced options are behaviorally unchanged", async () => {
    const onChange = vi.fn();

    // 1. Static options: unknown value does not inject "(Deleted item)"
    const staticStep = makeStaticChoiceStep("dropdown");
    const { unmount } = render(
      <ChoiceBlockRenderer
        step={staticStep}
        value="non-existent-id"
        onChange={onChange}
      />
    );

    const staticTrigger = await screen.findByRole("combobox");
    expect(staticTrigger.textContent).not.toContain("(Deleted item)");
    expect(screen.queryByText("(Deleted item)")).toBeNull();
    unmount();

    // 2. Query block options: unknown value does not inject "(Deleted item)"
    const queryStep = makeQueryBlockChoiceStep("dropdown");
    const queryContext = {
      query_results: {
        metadata: { source: "read_table" },
        rows: [{ id: "row-1", name: "Row One" }],
        columns: [{ id: "id", name: "id" }, { id: "name", name: "name" }],
        count: 1,
      },
    };

    render(
      <ChoiceBlockRenderer
        step={queryStep}
        value="deleted-row-id"
        onChange={onChange}
        context={queryContext}
      />
    );

    const queryTrigger = await screen.findByRole("combobox");
    expect(queryTrigger.textContent).not.toContain("(Deleted item)");
    expect(screen.queryByText("(Deleted item)")).toBeNull();
  });
});
