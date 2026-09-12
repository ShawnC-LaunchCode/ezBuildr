// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EmptySectionConfirmation } from "@/components/builder/pages/EmptySectionConfirmation";

describe("EmptySectionConfirmation", () => {
  it("names the Section and cancellation keeps the move unconfirmed", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <EmptySectionConfirmation
        sectionTitle="Assets"
        isPending={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("alertdialog")).toHaveTextContent("Assets");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("No page content is deleted");
    await user.click(screen.getByRole("button", { name: "Keep Section" }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms the atomic move-and-delete action", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <EmptySectionConfirmation
        sectionTitle="Assets"
        isPending={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", {
      name: "Move page and delete Section",
    }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
