// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultIssueCategory,
  ReviewIssueList,
  type ReviewIssue,
} from "../../../client/src/components/builder/tabs/review/ReviewIssueList";

const issues: ReviewIssue[] = [
  {
    type: "warning",
    category: "questions",
    message: "The Name question has no alias.",
    target: { tab: "sections", sectionId: "section-1", stepId: "step-1" },
  },
  {
    type: "error",
    category: "logic",
    message: "A logic rule points to a missing question.",
    target: { tab: "sections", panel: "logic" },
  },
  {
    type: "error",
    category: "documents",
    message: "The engagement letter has no template.",
    target: { tab: "templates" },
  },
  {
    type: "warning",
    category: "integrations",
    message: "DocuSign is not configured.",
    target: { tab: "sections", sectionId: "section-2", stepId: "signature-1" },
  },
];

afterEach(cleanup);

describe("ReviewIssueList", () => {
  it("groups publish findings into Questions, Logic, Documents, and Integrations tabs", async () => {
    const user = userEvent.setup();
    render(
      <ReviewIssueList
        isReady={false}
        isLinting={false}
        issues={issues}
        workflowId="workflow-1"
        onFix={vi.fn()}
      />
    );

    const tablist = screen.getByRole("tablist");
    expect(within(tablist).getByRole("tab", { name: "Questions(1)" })).toBeInTheDocument();
    expect(within(tablist).getByRole("tab", { name: "Logic(1)" })).toBeInTheDocument();
    expect(within(tablist).getByRole("tab", { name: "Documents(1)" })).toBeInTheDocument();
    expect(within(tablist).getByRole("tab", { name: "Integrations(1)" })).toBeInTheDocument();

    // Opens on Logic: the first category holding a blocking error.
    expect(screen.getByText("A logic rule points to a missing question.")).toBeInTheDocument();

    await user.click(within(tablist).getByRole("tab", { name: "Questions(1)" }));
    expect(screen.getByText("The Name question has no alias.")).toBeInTheDocument();
    await user.click(within(tablist).getByRole("tab", { name: "Documents(1)" }));
    expect(screen.getByText("The engagement letter has no template.")).toBeInTheDocument();
  });

  it("links each finding to its exact builder location and navigates through onFix", async () => {
    const user = userEvent.setup();
    const onFix = vi.fn();
    render(
      <ReviewIssueList
        isReady={false}
        isLinting={false}
        issues={issues}
        workflowId="workflow-1"
        onFix={onFix}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Questions(1)" }));
    const questionFix = screen.getByRole("link", { name: "Fix" });
    expect(questionFix).toHaveAttribute(
      "href",
      "/workflows/workflow-1/builder?tab=sections&sectionId=section-1&stepId=step-1"
    );
    fireEvent.click(questionFix);
    expect(onFix).toHaveBeenLastCalledWith(
      "/workflows/workflow-1/builder?tab=sections&sectionId=section-1&stepId=step-1"
    );

    await user.click(screen.getByRole("tab", { name: "Logic(1)" }));
    const logicFix = screen.getByRole("link", { name: "Fix" });
    expect(logicFix).toHaveAttribute(
      "href",
      "/workflows/workflow-1/builder?tab=sections&panel=logic"
    );
    fireEvent.click(logicFix);
    expect(onFix).toHaveBeenLastCalledWith(
      "/workflows/workflow-1/builder?tab=sections&panel=logic"
    );
  });

  it("opens on the category holding the blocking errors, not always on Questions", () => {
    // A gate that opens on an empty tab hides the reason publishing is refused.
    const documentsOnly = issues.filter(issue => issue.category === "documents");
    expect(defaultIssueCategory(documentsOnly)).toBe("documents");

    render(
      <ReviewIssueList
        isReady={false}
        isLinting={false}
        issues={documentsOnly}
        workflowId="workflow-1"
        onFix={vi.fn()}
      />
    );
    expect(screen.getByText("The engagement letter has no template.")).toBeInTheDocument();
  });

  it("prefers errors over warnings, then falls back to Questions when there is nothing to show", () => {
    // A warning in an earlier tab must not outrank an error in a later one.
    expect(defaultIssueCategory([issues[0], issues[2]])).toBe("documents");
    expect(defaultIssueCategory([issues[0]])).toBe("questions");
    expect(defaultIssueCategory([issues[3]])).toBe("integrations");
    expect(defaultIssueCategory([])).toBe("questions");
  });

  it("keeps publishing available for warnings and explains their audit trail", () => {
    render(
      <ReviewIssueList
        isReady
        isLinting={false}
        issues={[issues[0], issues[3]]}
        workflowId="workflow-1"
        onFix={vi.fn()}
      />
    );

    expect(screen.getByText("Ready to publish")).toBeInTheDocument();
    expect(screen.getByText(/records them in the audit log/i)).toBeInTheDocument();
  });
});
