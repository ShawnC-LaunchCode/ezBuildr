// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ApiSection } from "@/lib/vault-api";
import type { ConditionExpression } from "@shared/types/conditions";

const updateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const condition: ConditionExpression = {
  type: "group",
  id: "group",
  operator: "AND",
  conditions: [{
    type: "condition",
    id: "condition",
    variable: "earlier",
    operator: "is_true",
    valueType: "constant",
  }],
};

vi.mock("@/lib/vault-hooks", () => ({
  useCreateSection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSection: () => ({ mutateAsync: updateAsync, isPending: false }),
  useDeleteSection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/logic", () => ({
  LogicStatusText: () => <span>Visibility status</span>,
  LogicBuilder: ({ elementType, onChange }: { elementType: string; onChange: (value: ConditionExpression) => void }) => (
    <button data-testid="logic-builder" data-element-type={elementType} onClick={() => onChange(condition)}>
      Apply test condition
    </button>
  ),
}));

import { SectionSettingsDialog } from "@/components/builder/SectionSettingsDialog";

describe("SectionSettingsDialog Section visibility", () => {
  it("reuses LogicBuilder and persists its exact ConditionExpression with the dialog save", async () => {
    const section: ApiSection = {
      id: "section-1",
      workflowId: "workflow-1",
      title: "Household",
      description: null,
      visibleIf: null,
      createdAt: "2026-08-24T00:00:00.000Z",
    };
    render(
      <SectionSettingsDialog
        workflowId="workflow-1"
        section={section}
        pages={[]}
        open
        onOpenChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Visibility/ }));
    expect(screen.getByTestId("logic-builder")).toHaveAttribute("data-element-type", "section");
    fireEvent.click(screen.getByTestId("logic-builder"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateAsync).toHaveBeenCalledWith({
      id: "section-1",
      workflowId: "workflow-1",
      title: "Household",
      description: null,
      visibleIf: condition,
    }));
  });
});
