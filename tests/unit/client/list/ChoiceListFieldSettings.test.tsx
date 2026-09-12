// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListFieldSettings } from "../../../../client/src/components/builder/cards/list/ListFieldSettings";
import { ChoiceBlockRenderer } from "../../../../client/src/components/runner/blocks/ChoiceBlock";

import type { ApiStep } from "../../../../client/src/lib/vault-api";
import type { ChoiceAdvancedConfig, ListField } from "@shared/types/stepConfigs";

type QuestionField = Extract<ListField, { kind: "question" }>;

afterEach(() => {
  cleanup();
});

function choiceField(config?: ChoiceAdvancedConfig): QuestionField {
  return {
    kind: "question",
    id: "favorite-color",
    alias: "favoriteColor",
    title: "Favorite color",
    order: 0,
    type: "choice",
    config,
  };
}

function ChoiceFieldHarness({ initialField = choiceField() }: { initialField?: QuestionField }) {
  const [field, setField] = useState(initialField);
  return (
    <>
      <ListFieldSettings field={field} siblingFields={[]} onChange={setField} />
      <output data-testid="saved-config">{JSON.stringify(field.config)}</output>
    </>
  );
}

function readSavedConfig(): ChoiceAdvancedConfig {
  return JSON.parse(screen.getByTestId("saved-config").textContent ?? "null") as ChoiceAdvancedConfig;
}

function staticOptions(config: ChoiceAdvancedConfig) {
  if (!Array.isArray(config.options) && config.options.type === "static") {
    return config.options.options;
  }
  throw new Error("Expected static choice options");
}

describe("choice fields in ListFieldSettings (LIST2-8 AC1-3)", () => {
  it("adds, edits, reorders, and removes static options in field.config", () => {
    const initialConfig: ChoiceAdvancedConfig = {
      display: "dropdown",
      options: {
        type: "static",
        options: [
          { id: "red", label: "Red", alias: "Red" },
          { id: "blue", label: "Blue", alias: "Blue" },
        ],
      },
    };
    render(<ChoiceFieldHarness initialField={choiceField(initialConfig)} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Option" }));
    expect(staticOptions(readSavedConfig())).toEqual([
      { id: "red", label: "Red", alias: "Red" },
      { id: "blue", label: "Blue", alias: "Blue" },
      { id: "opt3", label: "Option 3", alias: "Option 3" },
    ]);

    fireEvent.change(screen.getAllByPlaceholderText("Display Value")[2], {
      target: { value: "Green" },
    });
    expect(staticOptions(readSavedConfig())[2]).toMatchObject({ label: "Green", alias: "Green" });

    fireEvent.change(screen.getByLabelText("Option order"), { target: { value: "opt3" } });
    fireEvent.click(screen.getByRole("button", { name: "Move selected option up" }));
    expect(staticOptions(readSavedConfig()).map((option) => option.label)).toEqual([
      "Red",
      "Green",
      "Blue",
    ]);

    const blueInput = screen.getAllByPlaceholderText("Display Value")[2];
    const blueRow = blueInput.closest(".flex.items-start");
    const blueRowButtons = blueRow?.querySelectorAll("button");
    const deleteButton = blueRowButtons?.[blueRowButtons.length - 1];
    if (!deleteButton) {
      throw new Error("Expected the reordered Blue option to have a delete button");
    }
    fireEvent.click(deleteButton);
    expect(staticOptions(readSavedConfig()).map((option) => option.label)).toEqual(["Red", "Green"]);
  });

  it("stores the authored option label when the drilled runner selects it", async () => {
    const onChange = vi.fn();
    const config: ChoiceAdvancedConfig = {
      display: "radio",
      options: {
        type: "static",
        options: [{ id: "opaque-id", label: "Sapphire", alias: "Sapphire" }],
      },
    };
    const field = choiceField(config);
    const syntheticStep = {
      id: field.id,
      alias: field.alias,
      title: field.title,
      type: field.type,
      config: field.config,
      required: false,
    } as ApiStep;

    render(<ChoiceBlockRenderer step={syntheticStep} value={undefined} onChange={onChange} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Sapphire" }));

    expect(onChange).toHaveBeenCalledWith("Sapphire");
    expect(onChange).not.toHaveBeenCalledWith("opaque-id");
  });
});

describe("duplicate-alias highlighting (LIST2-8 reviewer regression)", () => {
  // `ChoiceOptionsSettings` builds the duplicate set, but `StaticOptionsEditor`
  // does the lookup with `option.alias ?? option.id`. The two key derivations
  // must agree, or an aliasless option's duplicate is never highlighted while
  // save-time validation in `ChoiceCardEditor` (which also keys on `?? id`)
  // still rejects it — a save blocked with nothing flagged.
  it("flags aliasless options that collide on id", () => {
    render(
      <ChoiceFieldHarness
        initialField={choiceField({
          display: "dropdown",
          options: {
            type: "static",
            options: [
              { id: "dupe", label: "First" },
              { id: "dupe", label: "Second" },
            ],
          },
        })}
      />
    );

    expect(screen.getAllByText("Duplicate")).toHaveLength(2);
  });

  it("does not flag aliasless options with distinct ids but identical labels", () => {
    render(
      <ChoiceFieldHarness
        initialField={choiceField({
          display: "dropdown",
          options: {
            type: "static",
            options: [
              { id: "opt1", label: "Same Label" },
              { id: "opt2", label: "Same Label" },
            ],
          },
        })}
      />
    );

    expect(screen.queryByText("Duplicate")).not.toBeInTheDocument();
  });
});

describe("dynamic options for List choice fields (LIST2-8 AC5)", () => {
  it("shows an explanation instead of workflow-level dynamic option controls", () => {
    render(
      <ChoiceFieldHarness
        initialField={choiceField({
          display: "dropdown",
          options: {
            type: "list",
            listVariable: "owners",
            labelPath: "name",
            valuePath: "itemId",
          },
        })}
      />
    );

    expect(screen.getByRole("note")).toHaveTextContent(
      "Dynamic options aren't available for list fields"
    );
    expect(screen.getByText(/powered by tables or other lists/i)).toBeInTheDocument();
    expect(screen.queryByText("Options Source")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Option" })).not.toBeInTheDocument();
  });
});
