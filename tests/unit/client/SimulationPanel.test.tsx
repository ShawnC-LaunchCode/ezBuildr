// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SimulationPanel } from "@/components/builder/map/SimulationPanel";
import type { SimulationField } from "@/components/builder/map/simulationInputs";
import type { ApiStep } from "@/lib/vault-api";

const createdAt = "2026-08-08T00:00:00.000Z";

function step(overrides: Partial<ApiStep> & Pick<ApiStep, "id" | "sectionId" | "type" | "title">): ApiStep {
  return {
    id: overrides.id,
    workflowId: "wf-1",
    sectionId: overrides.sectionId,
    type: overrides.type,
    title: overrides.title,
    description: null,
    required: false,
    alias: overrides.alias ?? null,
    order: 0,
    isVirtual: false,
    config: null,
    createdAt,
  };
}

function textField(id: string, title: string): SimulationField {
  return {
    step: step({ id, sectionId: "sec-1", type: "short_text", title }),
    variable: { id, alias: null, label: title, title, type: "short_text", sectionId: "sec-1", sectionTitle: "Section One" },
    operatorConfig: { value: "equals", label: "equals", needsValue: true, valueType: "text" },
  };
}

afterEach(cleanup);

describe("SimulationPanel (MAP-8)", () => {
  it("shows the unconditional empty state when no step is referenced by any condition (AC5)", () => {
    render(<SimulationPanel fields={[]} answers={{}} onAnswerChange={vi.fn()} onReset={vi.fn()} truncated={false} />);

    expect(
      screen.getByText(/no condition in this workflow depends on an answer yet/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/unconditional/i)).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("renders exactly one field per referenced step, no more (AC1 rendering half)", () => {
    const fields = [textField("s1", "Full name"), textField("s2", "Email")];
    render(<SimulationPanel fields={fields} answers={{}} onAnswerChange={vi.fn()} onReset={vi.fn()} truncated={false} />);

    expect(screen.getByRole("group", { name: "Full name" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Email" })).toBeInTheDocument();
    expect(screen.getAllByRole("group")).toHaveLength(2);
  });

  it("calls onAnswerChange keyed by the field's step id when a value is typed", async () => {
    const user = userEvent.setup();
    const onAnswerChange = vi.fn();
    render(
      <SimulationPanel
        fields={[textField("s1", "Full name")]}
        answers={{}}
        onAnswerChange={onAnswerChange}
        onReset={vi.fn()}
        truncated={false}
      />
    );

    await user.type(screen.getByRole("textbox"), "A");

    expect(onAnswerChange).toHaveBeenCalledWith("s1", "A");
  });

  it("renders a visible warning when the simulation was truncated (AC6)", () => {
    render(<SimulationPanel fields={[]} answers={{}} onAnswerChange={vi.fn()} onReset={vi.fn()} truncated={true} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/incomplete/i);
  });

  it("renders no warning when the simulation completed normally", () => {
    render(<SimulationPanel fields={[]} answers={{}} onAnswerChange={vi.fn()} onReset={vi.fn()} truncated={false} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables Reset until an answer has been entered, and calls onReset when clicked", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    const { rerender } = render(
      <SimulationPanel fields={[textField("s1", "Full name")]} answers={{}} onAnswerChange={vi.fn()} onReset={onReset} truncated={false} />
    );

    expect(screen.getByRole("button", { name: /reset/i })).toBeDisabled();

    rerender(
      <SimulationPanel
        fields={[textField("s1", "Full name")]}
        answers={{ s1: "A" }}
        onAnswerChange={vi.fn()}
        onReset={onReset}
        truncated={false}
      />
    );

    const resetButton = screen.getByRole("button", { name: /reset/i });
    expect(resetButton).toBeEnabled();
    await user.click(resetButton);
    expect(onReset).toHaveBeenCalled();
  });

  it("labels a field with its alias, distinctly from the title, when the step has one", () => {
    const aliasField: SimulationField = {
      step: step({ id: "s1", sectionId: "sec-1", type: "short_text", title: "Full Name", alias: "full_name" }),
      variable: {
        id: "s1",
        alias: "full_name",
        label: "full_name",
        title: "Full Name",
        type: "short_text",
        sectionId: "sec-1",
        sectionTitle: "Section One",
      },
      operatorConfig: { value: "equals", label: "equals", needsValue: true, valueType: "text" },
    };
    render(<SimulationPanel fields={[aliasField]} answers={{}} onAnswerChange={vi.fn()} onReset={vi.fn()} truncated={false} />);

    const group = screen.getByRole("group", { name: "Full Name" });
    expect(within(group).getByText("(full_name)")).toBeInTheDocument();
  });
});
