import { describe, it, expect } from "vitest";

import { WorkflowJSON, WorkflowBlock } from "@shared/types/workflow";

import { WorkflowChangeAnalyzer } from "../../server/services/analyzer/WorkflowChangeAnalyzer";
describe("WorkflowChangeAnalyzer", () => {
    const analyzer = new WorkflowChangeAnalyzer();
    const createWorkflow = (blocks: WorkflowBlock[]): WorkflowJSON => ({
        id: "wf-1",
        title: "Test Workflow",
        pages: [{
            id: "page-1",
            title: "Page 1",
            order: 1,
            blocks
        }],
    });
    it("should classify unused variable deletion as soft breaking (or safe context dependent)", () => {
        const oldWf = createWorkflow([
            { id: "step-1", type: "short_text", title: "Name", alias: "name_var" },
            { id: "step-2", type: "short_text", title: "Email", alias: "email_var" }
        ]);
        // Remove step-1
        const newWf = createWorkflow([
            { id: "step-2", type: "short_text", title: "Email", alias: "email_var" }
        ]);
        const report = analyzer.analyze(oldWf, newWf);
        expect(report.severity).toBe("soft_breaking"); // Because schema changed
        expect(report.reasons.find(r => r.targetId === "step-1")).toBeDefined();
    });
    it("should classify used variable deletion as HARD breaking (JS Block)", () => {
        const oldWf = createWorkflow([
            { id: "step-1", type: "short_text", title: "Name", alias: "name_var" },
            { id: "block-js", type: "js_question", config: { inputKeys: ["step-1"] } }
        ]);
        const newWf = createWorkflow([
            { id: "block-js", type: "js_question", config: { inputKeys: ["step-1"] } } // step-1 deleted
        ]);
        const report = analyzer.analyze(oldWf, newWf);
        expect(report.severity).toBe("hard_breaking");
        expect(report.reasons[0].message).toContain("referenced by: JS Block");
    });
    it("should classify used variable deletion as HARD breaking (Alias reference)", () => {
        const oldWf = createWorkflow([
            { id: "step-1", type: "short_text", title: "Name", alias: "name_var" },
            { id: "block-js", type: "js_question", config: { inputKeys: ["name_var"] } }
        ]);
        const newWf = createWorkflow([
            { id: "block-js", type: "js_question", config: { inputKeys: ["name_var"] } }
        ]);
        const report = analyzer.analyze(oldWf, newWf);
        expect(report.severity).toBe("hard_breaking");
        expect(report.reasons[0].message).toContain("referenced by: JS Block");
    });
    it("should classify new required variable as SOFT breaking", () => {
        const oldWf = createWorkflow([]);
        const newWf = createWorkflow([
            { id: "step-new", type: "short_text", required: true }
        ]);
        const report = analyzer.analyze(oldWf, newWf);
        expect(report.severity).toBe("soft_breaking");
    });
    it("should classify type change as HARD breaking", () => {
        const oldWf = createWorkflow([
            { id: "step-1", type: "short_text" }
        ]);
        const newWf = createWorkflow([
            { id: "step-1", type: "number" }
        ]);
        const report = analyzer.analyze(oldWf, newWf);
        expect(report.severity).toBe("hard_breaking");
    });
});