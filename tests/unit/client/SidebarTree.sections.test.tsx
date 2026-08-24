// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarTree } from "../../../client/src/components/builder/SidebarTree";
import { TooltipProvider } from "../../../client/src/components/ui/tooltip";
import type { ApiPage, ApiSection } from "../../../client/src/lib/vault-api";

const mocks = vi.hoisted(() => ({
  pages: [] as ApiPage[],
  sections: [] as ApiSection[],
  pagesLoading: false,
  sectionsLoading: false,
  pagesError: false,
  sectionsError: false,
  createSection: vi.fn(),
  updateSection: vi.fn(),
  deleteSection: vi.fn(),
}));

vi.mock("@/lib/vault-hooks", () => ({
  useWorkflow: () => ({ data: { id: "workflow-1", modeOverride: "easy", projectId: null } }),
  usePages: () => ({ data: mocks.pages, isLoading: mocks.pagesLoading, isError: mocks.pagesError }),
  useSections: () => ({ data: mocks.sections, isLoading: mocks.sectionsLoading, isError: mocks.sectionsError }),
  useBlocks: () => ({ data: [] }),
  useCreatePageAtEnd: () => ({ createPageAtEnd: vi.fn(), isPending: false }),
  useCreateStep: () => ({ mutateAsync: vi.fn() }),
  useCreateSection: () => ({ mutateAsync: mocks.createSection, isPending: false }),
  useUpdateSection: () => ({ mutateAsync: mocks.updateSection, isPending: false }),
  useDeleteSection: () => ({ mutateAsync: mocks.deleteSection, isPending: false }),
}));

vi.mock("@/components/builder/sidebar/PageItem", () => ({
  PageItem: ({
    page,
    nested,
    isExpanded,
    onToggle,
  }: {
    page: ApiPage;
    nested?: boolean;
    isExpanded: boolean;
    onToggle: () => void;
  }) => (
    <div data-outline-page={page.id} data-nested={nested ? "true" : "false"}>
      <span>{page.title}</span>
      <button type="button" onClick={onToggle} aria-expanded={isExpanded}>
        Toggle page {page.title}
      </button>
    </div>
  ),
}));

vi.mock("@/components/builder/ai/AiAssistantDialog", () => ({ AiAssistantDialog: () => null }));
vi.mock("@/components/builder/AddSnipDialog", () => ({ AddSnipDialog: () => null }));
vi.mock("@/components/builder/BlockEditorDialog", () => ({ BlockEditorDialog: () => null }));
vi.mock("@/components/builder/PageSettingsDialog", () => ({ PageSettingsDialog: () => null }));
vi.mock("@/components/builder/sidebar/DocumentStatusPanel", () => ({ DocumentStatusPanel: () => null }));

const page = (id: string, title: string, order: number, sectionId: string | null = null): ApiPage => ({
  id,
  workflowId: "workflow-1",
  title,
  description: null,
  order,
  sectionId,
  createdAt: "2026-08-23T00:00:00.000Z",
});

const section = (id: string, title: string): ApiSection => ({
  id,
  workflowId: "workflow-1",
  title,
  description: null,
  createdAt: "2026-08-23T00:00:00.000Z",
});

function renderTree() {
  return render(
    <TooltipProvider>
      <SidebarTree workflowId="workflow-1" />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  mocks.pages = [];
  mocks.sections = [];
  mocks.pagesLoading = false;
  mocks.sectionsLoading = false;
  mocks.pagesError = false;
  mocks.sectionsError = false;
  mocks.createSection.mockReset().mockResolvedValue(section("new-section", "New"));
  mocks.updateSection.mockReset().mockResolvedValue(section("section-a", "Renamed"));
  mocks.deleteSection.mockReset().mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("SidebarTree Sections", () => {
  it("renders Sections at their first member page and keeps ungrouped pages in exact global order", async () => {
    const user = userEvent.setup();
    mocks.sections = [section("section-a", "Assets"), section("section-b", "Debts")];
    mocks.pages = [
      page("page-a1", "Real Property", 1, "section-a"),
      page("page-a2", "Bank Accounts", 2, "section-a"),
      page("page-u", "Contact details", 3),
      page("page-b1", "Credit Cards", 4, "section-b"),
    ];
    const { container } = renderTree();

    await user.click(screen.getByRole("button", { name: "Expand Section Assets" }));
    await user.click(screen.getByRole("button", { name: "Expand Section Debts" }));

    const text = container.textContent ?? "";
    expect(text.indexOf("Assets")).toBeLessThan(text.indexOf("Real Property"));
    expect(text.indexOf("Real Property")).toBeLessThan(text.indexOf("Bank Accounts"));
    expect(text.indexOf("Bank Accounts")).toBeLessThan(text.indexOf("Contact details"));
    expect(text.indexOf("Contact details")).toBeLessThan(text.indexOf("Debts"));
    expect(text.indexOf("Debts")).toBeLessThan(text.indexOf("Credit Cards"));
    expect(container.querySelector('[data-outline-page="page-u"]')).toHaveAttribute("data-nested", "false");
  });

  it("renders unknown Section membership safely at the top level", () => {
    mocks.sections = [section("section-a", "Assets")];
    mocks.pages = [page("page-unknown", "Imported page", 1, "missing-section")];
    const { container } = renderTree();

    expect(screen.getByText("Imported page")).toBeInTheDocument();
    expect(container.querySelector('[data-outline-page="page-unknown"]')).toHaveAttribute("data-nested", "false");
  });

  it("keeps the literal flat Page path when the workflow has zero Sections", () => {
    mocks.pages = [page("page-1", "First page", 1), page("page-2", "Second page", 2)];
    const { container } = renderTree();

    expect(screen.queryByRole("region", { name: /Section/ })).toBeNull();
    expect(container.querySelectorAll('[data-nested="false"]')).toHaveLength(2);
  });

  it("preserves independent Section and Page disclosure state through query replacement", async () => {
    const user = userEvent.setup();
    mocks.sections = [section("section-a", "Assets")];
    mocks.pages = [page("page-a", "Property", 1, "section-a")];
    const view = renderTree();

    await user.click(screen.getByRole("button", { name: "Expand Section Assets" }));
    await user.click(screen.getByRole("button", { name: "Toggle page Property" }));
    expect(screen.getByRole("button", { name: "Toggle page Property" })).toHaveAttribute("aria-expanded", "true");

    mocks.sections = [{ ...mocks.sections[0], title: "Assets updated" }];
    mocks.pages = [{ ...mocks.pages[0], title: "Property updated" }];
    view.rerender(<TooltipProvider><SidebarTree workflowId="workflow-1" /></TooltipProvider>);

    expect(screen.getByRole("button", { name: "Collapse Section Assets updated" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle page Property updated" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Collapse Section Assets updated" }));
    expect(screen.queryByText("Property updated")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Expand Section Assets updated" }));
    expect(screen.getByRole("button", { name: "Toggle page Property updated" })).toHaveAttribute("aria-expanded", "true");
  });

  it("supports ArrowRight and ArrowLeft on both Section disclosure controls", async () => {
    const user = userEvent.setup();
    mocks.sections = [section("section-a", "Assets")];
    mocks.pages = [page("page-a", "Property", 1, "section-a")];
    renderTree();

    const titleToggle = screen.getByRole("button", { name: /^Assets 1 page$/ });
    titleToggle.focus();
    await user.keyboard("{ArrowRight}");
    expect(titleToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Property")).toBeInTheDocument();

    const chevron = screen.getByRole("button", { name: "Collapse Section Assets" });
    chevron.focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.queryByText("Property")).toBeNull();
  });

  it("blocks empty and non-contiguous creation, then submits a trimmed contiguous span", async () => {
    const user = userEvent.setup();
    mocks.pages = [page("page-1", "One", 1), page("page-2", "Two", 2), page("page-3", "Three", 3)];
    renderTree();

    await user.click(screen.getByRole("button", { name: "Add Section" }));
    const submit = screen.getByRole("button", { name: "Create Section" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("Select at least one ungrouped page.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Section title"), "  Assets  ");
    await user.click(screen.getByRole("checkbox", { name: "One" }));
    await user.click(screen.getByRole("checkbox", { name: "Three" }));
    expect(screen.getByText("Selected pages must form one continuous ungrouped span.")).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Two" }));
    await user.click(submit);
    await waitFor(() => expect(mocks.createSection).toHaveBeenCalledWith({
      workflowId: "workflow-1",
      title: "Assets",
      description: null,
      visibleIf: null,
      pageIds: ["page-1", "page-2", "page-3"],
    }));
  });

  it("renames with only editable fields", async () => {
    const user = userEvent.setup();
    mocks.sections = [{ ...section("section-a", "Assets"), description: "Current", visibleIf: { type: "condition" } }];
    mocks.pages = [page("page-a", "Property", 1, "section-a")];
    renderTree();

    await user.click(screen.getByRole("button", { name: "Section settings: Assets" }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Section title"));
    await user.type(screen.getByLabelText("Section title"), "Property and Assets");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateSection).toHaveBeenCalledWith({
      id: "section-a",
      workflowId: "workflow-1",
      title: "Property and Assets",
      description: "Current",
      visibleIf: null,
    }));
  });

  it("explains delete-keeps-pages, deletes only after confirmation, and shows refreshed pages top-level", async () => {
    const user = userEvent.setup();
    mocks.sections = [section("section-a", "Assets")];
    mocks.pages = [page("page-a", "Property", 1, "section-a")];
    const view = renderTree();

    await user.click(screen.getByRole("button", { name: "Section settings: Assets" }));
    await user.click(screen.getByRole("button", { name: "Delete Section" }));
    expect(screen.getByText(/pages in this Section will be kept in the same order and become ungrouped/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete Section" }));
    await waitFor(() => expect(mocks.deleteSection).toHaveBeenCalledWith({ id: "section-a", workflowId: "workflow-1" }));

    mocks.sections = [];
    mocks.pages = [page("page-a", "Property", 1)];
    view.rerender(<TooltipProvider><SidebarTree workflowId="workflow-1" /></TooltipProvider>);
    expect(view.container.querySelector('[data-outline-page="page-a"]')).toHaveAttribute("data-nested", "false");
  });

  it("shows stable loading and error feedback", () => {
    mocks.sectionsLoading = true;
    const view = renderTree();
    expect(screen.getByRole("status")).toHaveTextContent("Loading outline");
    expect(screen.queryByText("No pages yet.")).toBeNull();

    mocks.sectionsLoading = false;
    mocks.sectionsError = true;
    view.rerender(<TooltipProvider><SidebarTree workflowId="workflow-1" /></TooltipProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("outline could not be loaded");
  });
});
