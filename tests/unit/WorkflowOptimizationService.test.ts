
import { describe, it, expect } from "vitest";
import { workflowOptimizationService } from "../../server/services/ai/WorkflowOptimizationService";
import { WorkflowJSON } from "../../shared/types/workflow";

describe("WorkflowOptimizationService", () => {
    it("should calculate metrics", async () => {
        const workflow: WorkflowJSON = {
            id: "1",
            title: "Test Workflow",
            pages: [
                {
                    id: "p1",
                    title: "Page 1",
                    order: 0,
                    blocks: [
                        { id: "b1", type: "short_text", title: "Name" },
                        { id: "b2", type: "email", title: "Email" }
                    ]
                }
            ]
        };

        const result = await workflowOptimizationService.analyze(workflow);
        expect(result.metrics.totalBlocks).toBe(2);
        expect(result.metrics.totalPages).toBe(1);
        expect(result.optimizationScore).toBe(100);
    });

    it("should detect long pages", async () => {
        const blocks = Array.from({ length: 12 }, (_, i) => ({
            id: `b${i}`,
            type: "short_text",
            title: `Q${i}`
        }));

        const workflow: WorkflowJSON = {
            id: "1",
            title: "Long Page Workflow",
            pages: [
                {
                    id: "p1",
                    title: "Long Page",
                    order: 0,
                    blocks: blocks as any
                }
            ]
        };

        const result = await workflowOptimizationService.analyze(workflow);
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues[0].category).toBe("page_structure");
        expect(result.optimizationScore).toBeLessThan(100);
    });

    it("should auto-fix long pages (simulate split)", async () => {
        // Setup similar to above
        const blocks = Array.from({ length: 12 }, (_, i) => ({
            id: `b${i}`,
            type: "short_text",
            title: `Q${i}`
        }));

        const workflow: WorkflowJSON = {
            id: "1",
            title: "Split Me",
            pages: [{ id: "p1", title: "Big Page", order: 1, blocks: blocks as any }]
        };

        // Direct call to fix
        const fixPayload = { pageId: "p1", splitAtIndex: 6 };
        const { updatedWorkflow } = await workflowOptimizationService.applyFixes(workflow, [{
            type: "split_page",
            description: "Split",
            payload: fixPayload
        }]);

        expect(updatedWorkflow.pages.length).toBe(2);
        expect(updatedWorkflow.pages[0].blocks.length).toBe(6);
        expect(updatedWorkflow.pages[1].blocks.length).toBe(6);
    });

    it("should detect duplicate questions", async () => {
        const workflow: WorkflowJSON = {
            id: "1",
            title: "Dupes",
            pages: [
                {
                    id: "p1",
                    title: "P1",
                    order: 0,
                    blocks: [
                        { id: "b1", type: "short_text", title: "What is your name?" },
                        { id: "b2", type: "long_text", title: "What is your name?" }
                    ]
                }
            ]
        };

        const result = await workflowOptimizationService.analyze(workflow);
        const issue = result.issues.find(i => i.id.startsWith("duplicate"));
        expect(issue).toBeDefined();
        expect(issue?.severity).toBe("medium");
    });
});
