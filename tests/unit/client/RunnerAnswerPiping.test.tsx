// @vitest-environment jsdom
import { useEffect } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BlockRenderer } from "@/components/runner/blocks/BlockRenderer";
import { DisplayBlockRenderer } from "@/components/runner/blocks/DisplayBlock";
import { ListDrillProvider, useListDrill } from "@/components/runner/list/ListDrillContext";
import { ListDrillEditor } from "@/components/runner/list/ListDrillEditor";
import type { RunnerAnswerDefinitions } from "@/components/runner/runnerInterpolation";
import type { ApiStep } from "@/lib/vault-api";

import type { ListValue } from "@shared/types/stepConfigs";

const createdAt = "2026-08-10T00:00:00.000Z";

function makeStep(overrides: Partial<ApiStep> = {}): ApiStep {
  return {
    id: "question-1",
    workflowId: "workflow-1",
    pageId: "page-1",
    type: "short_text",
    title: "Question",
    description: null,
    required: false,
    alias: "question",
    order: 1,
    isVirtual: false,
    config: null,
    createdAt,
    ...overrides,
  };
}

function renderQuestion(
  step: ApiStep,
  context: Record<string, unknown>,
  aliasMap: Record<string, string>,
  answerDefinitions: RunnerAnswerDefinitions
) {
  return render(
    <BlockRenderer
      step={step}
      value={null}
      onChange={() => undefined}
      context={context}
      aliasMap={aliasMap}
      answerDefinitions={answerDefinitions}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("TPL-7 runner answer piping", () => {
  it("interpolates question titles and descriptions reactively", () => {
    const step = makeStep({
      title: "Welcome, {{client_name | titlecase}}",
      description: "Is {{client_name | upper}} your legal name?",
    });
    const aliasMap = { client_name: "name-step" };
    const definitions = { "name-step": { type: "short_text", config: null } };
    const { rerender } = renderQuestion(step, { "name-step": "ada lovelace" }, aliasMap, definitions);

    expect(screen.getByText("Welcome, Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Is ADA LOVELACE your legal name?")).toBeInTheDocument();

    rerender(
      <BlockRenderer
        step={step}
        value={null}
        onChange={() => undefined}
        context={{ "name-step": "grace hopper" }}
        aliasMap={aliasMap}
        answerDefinitions={definitions}
      />
    );

    expect(screen.getByText("Welcome, Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Is GRACE HOPPER your legal name?")).toBeInTheDocument();
  });

  it("uses the document filter vocabulary in display blocks for case, currency, and date presets", () => {
    const step = makeStep({
      id: "display-1",
      type: "display",
      title: "Display",
      alias: null,
      config: {
        markdown: "{{client_name | trim | upper}} owes {{fee | usd}} on {{signing_date | longdate}}.",
      },
    });

    render(
      <DisplayBlockRenderer
        step={step}
        context={{
          "name-step": "  Ada  ",
          "fee-step": 1234.5,
          "date-step": "2026-01-05",
        }}
        aliasMap={{
          client_name: "name-step",
          fee: "fee-step",
          signing_date: "date-step",
        }}
        answerDefinitions={{
          "name-step": { type: "short_text" },
          "fee-step": { type: "currency" },
          "date-step": { type: "date" },
        }}
      />
    );

    expect(screen.getByText("ADA owes $1,234.50 on January 5, 2026.")).toBeInTheDocument();
  });

  it("formats address and legacy multiple-choice answers as human-readable text", () => {
    const step = makeStep({
      id: "display-1",
      type: "display",
      title: "Display",
      alias: null,
      config: { markdown: "Ship {{shipping_address}} by {{delivery_method}}." },
    });
    const choiceConfig = {
      options: [
        { id: "overnight-id", alias: "overnight", label: "Overnight delivery" },
      ],
    };

    render(
      <DisplayBlockRenderer
        step={step}
        context={{
          "address-step": {
            street: "12 Oak St",
            city: "Austin",
            state: "TX",
            zip: "78701",
          },
          "choice-step": "overnight-id",
        }}
        aliasMap={{
          shipping_address: "address-step",
          delivery_method: "choice-step",
        }}
        answerDefinitions={{
          "address-step": { type: "address_advanced", config: null },
          "choice-step": { type: "multiple_choice", config: choiceConfig },
        }}
      />
    );

    expect(
      screen.getByText("Ship 12 Oak St, Austin, TX 78701 by Overnight delivery.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/\{"street"/)).not.toBeInTheDocument();
  });

  it("renders missing answers blank or through the default filter without throwing", () => {
    const step = makeStep({
      id: "display-1",
      type: "display",
      title: "Display",
      alias: null,
      config: { markdown: "Missing: [{{unknown}}] Fallback: [{{unanswered | default:\"N/A\"}}]" },
    });

    expect(() => {
      render(
        <DisplayBlockRenderer
          step={step}
          context={{}}
          aliasMap={{ unanswered: "known-step" }}
          answerDefinitions={{ "known-step": { type: "short_text" } }}
        />
      );
    }).not.toThrow();

    expect(screen.getByText("Missing: [] Fallback: [N/A]")).toBeInTheDocument();
  });

  it("escapes a script-tag-shaped answer at the markdown interpolation boundary", () => {
    const step = makeStep({
      id: "display-1",
      type: "display",
      title: "Display",
      alias: null,
      config: { markdown: "Answer: {{answer}}" },
    });
    const unsafeAnswer = "<script>alert('pwned')</script> **not bold**";

    const { container } = render(
      <DisplayBlockRenderer
        step={step}
        context={{ "answer-step": unsafeAnswer }}
        aliasMap={{ answer: "answer-step" }}
        answerDefinitions={{ "answer-step": { type: "long_text" } }}
      />
    );

    expect(screen.getByText(`Answer: ${unsafeAnswer}`)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("strong")).toBeNull();
  });
});

function makeListStep(): ApiStep {
  return makeStep({
    id: "household-list",
    type: "list",
    title: "Household",
    alias: "household",
    config: {
      fields: [
        {
          kind: "question",
          id: "address-field",
          alias: "home_address",
          type: "address_advanced",
          title: "Home address",
          order: 0,
          config: null,
        },
        {
          kind: "question",
          id: "status-field",
          alias: "resident_status",
          type: "multiple_choice",
          title: "Resident status",
          order: 1,
          config: {
            options: [{ id: "owner-id", alias: "owner", label: "Property owner" }],
          },
        },
        {
          kind: "question",
          id: "confirm-field",
          alias: "confirmation",
          type: "short_text",
          title: "Confirm {{home_address}} for {{resident_status}}",
          description: "This item belongs to {{resident_status | lower}}.",
          order: 2,
          config: null,
        },
      ],
    },
  });
}

const listValue: ListValue = {
  items: [{
    itemId: "item-1",
    values: {
      home_address: {
        street: "12 Oak St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      resident_status: "owner-id",
      confirmation: "",
    },
  }],
};

function ListPipingHarness() {
  const { drill, enterList } = useListDrill();
  const step = makeListStep();

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
      value={listValue}
      onChange={() => undefined}
      drill={drill}
    />
  );
}

describe("TPL-7 List-nested answer piping", () => {
  it("formats structured sibling values in a List item's question text", async () => {
    render(
      <ListDrillProvider>
        <ListPipingHarness />
      </ListDrillProvider>
    );

    expect(
      await screen.findByText("Confirm 12 Oak St, Austin, TX 78701 for Property owner")
    ).toBeInTheDocument();
    expect(screen.getByText("This item belongs to property owner.")).toBeInTheDocument();
  });
});
