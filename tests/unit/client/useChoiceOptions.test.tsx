// @vitest-environment jsdom
/**
 * RUN2-14 — Choice option pipeline: reload storm + empty-alias crash.
 *
 * (a) useChoiceOptions' effect used to depend on the whole `context` object
 *     (the entire run value map), which is a new reference on every keystroke
 *     in any field on the page. For a table_column-backed question that meant
 *     one /api/tables/*\/rows fetch per keystroke; for list/static it meant
 *     rebuilding the options array every keystroke. The fix narrows the
 *     dependency to context[listVariable] (the only thing option resolution
 *     actually reads from context, and only for `type: 'list'`).
 *
 * (b) `alias: opt.alias ?? opt.id` didn't coalesce an authored empty string,
 *     so an option with `alias: ""` reached Radix's SelectItem and crashed
 *     the whole question. useChoiceOptions now normalizes every option's
 *     identity in one place before it reaches the renderer.
 */
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ChoiceBlockRenderer } from "../../../client/src/components/runner/blocks/ChoiceBlock";
import { useChoiceOptions } from "../../../client/src/components/runner/blocks/choice/useChoiceOptions";
import { generateOptionsFromList } from "../../../client/src/lib/choice-utils";

import type { Step } from "../../../client/src/types";

vi.mock("@/lib/choice-utils", () => ({
  generateOptionsFromList: vi.fn((listData: unknown) =>
    Array.isArray(listData)
      ? listData.map((value: unknown, idx: number) => ({
          id: String(idx),
          label: String(value),
          alias: String(value),
        }))
      : []
  ),
}));

const generateOptionsFromListMock = generateOptionsFromList as unknown as ReturnType<typeof vi.fn>;

function makeTableColumnStep(): Step {
  return {
    id: "step-table",
    workflowId: "wf-1",
    sectionId: "sec-1",
    type: "choice",
    title: "Pick a row",
    description: null,
    required: false,
    alias: "pick_row",
    order: 1,
    isVirtual: false,
    config: {
      display: "dropdown",
      options: {
        type: "table_column",
        dataSourceId: "db-1",
        tableId: "tbl-1",
        columnId: "col-1",
      },
    },
    createdAt: "2026-07-25T00:00:00.000Z",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture, real ApiStep shape
  } as any;
}

function makeListStep(): Step {
  return {
    id: "step-list",
    workflowId: "wf-1",
    sectionId: "sec-1",
    type: "choice",
    title: "Pick from list",
    description: null,
    required: false,
    alias: "pick_from_list",
    order: 1,
    isVirtual: false,
    config: {
      display: "dropdown",
      options: {
        type: "list",
        listVariable: "myList",
        labelPath: "name",
        valuePath: "id",
      },
    },
    createdAt: "2026-07-25T00:00:00.000Z",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture, real ApiStep shape
  } as any;
}

describe("useChoiceOptions — RUN2-14(a) narrowed dependency", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: async () => ({ rows: [{ data: { "col-1": "Alpha" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("issues zero additional /api/tables/*/rows requests when an unrelated field changes on every keystroke", async () => {
    const step = makeTableColumnStep();
    const { result, rerender } = renderHook(
      ({ context }: { context: Record<string, unknown> }) => useChoiceOptions(step, context),
      { initialProps: { context: { other_field: "" } } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Simulate keystrokes in an unrelated field: a brand-new context object
    // each time (as the real run-value map is), but the table question reads
    // nothing from context, so none of these should trigger a refetch.
    for (const typed of ["a", "ab", "abc"]) {
      rerender({ context: { other_field: typed } });
    }

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still refreshes a list-backed question's options when its source list changes, but not on an unrelated keystroke", async () => {
    generateOptionsFromListMock.mockClear();
    const step = makeListStep();
    const sourceList = ["Alpha"];

    const { result, rerender } = renderHook(
      ({ context }: { context: Record<string, unknown> }) => useChoiceOptions(step, context),
      { initialProps: { context: { myList: sourceList, other_field: "" } } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(generateOptionsFromListMock).toHaveBeenCalledTimes(1);
    expect(result.current.options.map((o) => o.label)).toEqual(["Alpha"]);

    // Unrelated keystroke: new context object, but `myList` keeps the same
    // reference (mirrors useRunValues' shallow `{ ...prev, [stepId]: value }`
    // update, where untouched keys retain identity).
    rerender({ context: { myList: sourceList, other_field: "a" } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(generateOptionsFromListMock).toHaveBeenCalledTimes(1);

    // The source list itself changes: options must refresh.
    const newList = ["Beta", "Gamma"];
    rerender({ context: { myList: newList, other_field: "a" } });
    await waitFor(() =>
      expect(result.current.options.map((o) => o.label)).toEqual(["Beta", "Gamma"])
    );
    expect(generateOptionsFromListMock).toHaveBeenCalledTimes(2);
  });
});

function makeStaticStep(display: "radio" | "dropdown" | "multiple", allowMultiple = false): Step {
  return {
    id: "step-choice",
    workflowId: "wf-1",
    sectionId: "sec-1",
    type: "choice",
    title: "Pick one",
    description: null,
    required: false,
    alias: "pick_one",
    order: 1,
    isVirtual: false,
    config: {
      display,
      allowMultiple,
      options: {
        type: "static",
        options: [
          { id: "good", label: "Good Option", alias: "" }, // authored with an empty alias
          { label: "No Identity Option" }, // missing both alias and id
          { id: "other", label: "Other Option", alias: "other" },
        ],
      },
    },
    createdAt: "2026-07-25T00:00:00.000Z",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture, real ApiStep shape
  } as any;
}

describe("ChoiceBlockRenderer — RUN2-14(b) empty option alias", () => {
  beforeAll(() => {
    // jsdom doesn't implement layout/pointer-capture APIs Radix's Select
    // primitive relies on when opening; stub them so the dropdown test can
    // actually open the popover instead of erroring on an unrelated API gap.
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

  it("renders radio options (incl. empty-alias and no-identity options) without throwing and stores a non-empty stable value", async () => {
    const onChange = vi.fn();
    const step = makeStaticStep("radio");

    render(<ChoiceBlockRenderer step={step} value={undefined} onChange={onChange} />);

    // Both the `alias: ""` option and the option missing id+alias entirely
    // must render as normal radio inputs, not crash the block.
    const emptyAliasOption = await screen.findByRole("radio", { name: "Good Option" });
    const noIdentityOption = await screen.findByRole("radio", { name: "No Identity Option" });

    const user = userEvent.setup();
    await user.click(emptyAliasOption);
    const firstStored = onChange.mock.calls[0]?.[0] as string;
    expect(typeof firstStored).toBe("string");
    expect(firstStored.trim().length).toBeGreaterThan(0);

    await user.click(noIdentityOption);
    const secondStored = onChange.mock.calls[1]?.[0] as string;
    expect(typeof secondStored).toBe("string");
    expect(secondStored.trim().length).toBeGreaterThan(0);
    expect(secondStored).not.toBe(firstStored);

    // Selecting the same option again must yield the same generated value
    // (stable, not re-randomized per click).
    await user.click(emptyAliasOption);
    const thirdStored = onChange.mock.calls[2]?.[0] as string;
    expect(thirdStored).toBe(firstStored);
  });

  it("renders dropdown options (incl. empty-alias and no-identity options) without throwing and stores a non-empty stable value", async () => {
    const onChange = vi.fn();
    const step = makeStaticStep("dropdown");

    render(<ChoiceBlockRenderer step={step} value={undefined} onChange={onChange} />);

    const trigger = await screen.findByRole("combobox");
    const user = userEvent.setup();
    await user.click(trigger);

    await screen.findByRole("option", { name: "No Identity Option" });
    const option = await screen.findByRole("option", { name: "Good Option" });
    await user.click(option);

    expect(onChange).toHaveBeenCalledTimes(1);
    const stored = onChange.mock.calls[0]?.[0] as string;
    expect(typeof stored).toBe("string");
    expect(stored.trim().length).toBeGreaterThan(0);
  });

  it("renders multiple-choice (checkbox) options (incl. empty-alias and no-identity options) without throwing and stores a non-empty stable value", async () => {
    const onChange = vi.fn();
    const step = makeStaticStep("multiple", true);

    render(<ChoiceBlockRenderer step={step} value={[]} onChange={onChange} />);

    await screen.findByRole("checkbox", { name: "No Identity Option" });
    const option = await screen.findByRole("checkbox", { name: "Good Option" });
    const user = userEvent.setup();
    await user.click(option);

    expect(onChange).toHaveBeenCalledTimes(1);
    const stored = onChange.mock.calls[0]?.[0] as string[];
    expect(Array.isArray(stored)).toBe(true);
    expect(stored[0]?.trim().length).toBeGreaterThan(0);
  });

  it("selecting the empty-alias option twice (select then deselect) never stores an empty string", async () => {
    const onChange = vi.fn();
    const step = makeStaticStep("multiple", true);
    const { rerender } = render(<ChoiceBlockRenderer step={step} value={[]} onChange={onChange} />);

    const option = await screen.findByRole("checkbox", { name: "Good Option" });
    const user = userEvent.setup();
    await user.click(option);

    const selectedValue = (onChange.mock.calls[0]?.[0] as string[])[0];
    expect(selectedValue).toBeTruthy();

    await act(async () => {
      rerender(
        <ChoiceBlockRenderer step={step} value={[selectedValue]} onChange={onChange} />
      );
    });

    const checked = await screen.findByRole("checkbox", { name: "Good Option" });
    await user.click(checked);

    const afterDeselect = onChange.mock.calls[1]?.[0] as string[];
    expect(afterDeselect).toEqual([]);
  });
});
