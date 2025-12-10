
import {
    OptimizationIssue,
    OptimizationResult,
    OptimizationSuggestion,
    WorkflowMetrics,
    OptimizationFix,
    OptimizationCategory,
} from "@shared/types/optimization";
import { WorkflowJSON, WorkflowPage, WorkflowBlock } from "@shared/types/workflow";
import { v4 as uuidv4 } from "uuid";

export class WorkflowOptimizationService {
    /**
     * Main entry point to analyze a workflow
     */
    async analyze(workflow: WorkflowJSON, options: any = {}): Promise<OptimizationResult> {
        const issues: OptimizationIssue[] = [];
        const suggestions: OptimizationSuggestion[] = [];

        // 1. Calculate basic metrics
        const metrics = this.calculateMetrics(workflow);

        // 2. Run Analyzers based on options or default to all
        if (options.includePageStructure !== false) {
            issues.push(...this.analyzePageStructure(workflow));
        }
        if (options.includeBlockStructure !== false) {
            issues.push(...this.analyzeBlockStructure(workflow));
        }
        if (options.includeLogicAnalysis !== false) {
            issues.push(...this.analyzeLogic(workflow));
        }

        // 3. Generate Suggestions from Issues
        suggestions.push(...this.generateSuggestions(issues, workflow));

        // 4. Calculate Score
        const optimizationScore = this.calculateScore(issues, metrics);

        return {
            issues,
            suggestions,
            optimizationScore,
            metrics,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Applies a list of fixes to the workflow and returns the result
     */
    async applyFixes(workflow: WorkflowJSON, fixes: OptimizationFix[]): Promise<{ updatedWorkflow: WorkflowJSON, appliedCount: number }> {
        // Deep clone to avoid mutating original
        const updatedWorkflow = JSON.parse(JSON.stringify(workflow)) as WorkflowJSON;
        let appliedCount = 0;

        for (const fix of fixes) {
            try {
                switch (fix.type) {
                    case "split_page":
                        this.applySplitPage(updatedWorkflow, fix.payload as any);
                        appliedCount++;
                        break;
                    case "merge_pages":
                        this.applyMergePages(updatedWorkflow, fix.payload as any);
                        appliedCount++;
                        break;
                    case "delete_block":
                        this.applyDeleteBlock(updatedWorkflow, fix.payload as any);
                        appliedCount++;
                        break;
                    case "move_block":
                        this.applyMoveBlock(updatedWorkflow, fix.payload as any);
                        appliedCount++;
                        break;
                    // Add other fix types here
                }
            } catch (err) {
                console.error(`Failed to apply fix ${fix.type}:`, err);
            }
        }

        return { updatedWorkflow, appliedCount };
    }

    // =========================================================================
    // ANALYZERS
    // =========================================================================

    private analyzePageStructure(workflow: WorkflowJSON): OptimizationIssue[] {
        const issues: OptimizationIssue[] = [];
        const pages = workflow.pages || [];

        pages.forEach((page, index) => {
            const blocks = page.blocks || [];

            // A. Long Pages
            if (blocks.length > 10) {
                issues.push({
                    id: `long-page-${page.id}`,
                    category: "page_structure",
                    severity: "medium",
                    title: "Page is too long",
                    description: `Page "${page.title}" has ${blocks.length} blocks. Consider splitting it.`,
                    location: { pageId: page.id },
                    fixable: true,
                    suggestedFix: {
                        type: "split_page",
                        description: "Split page after 5th block",
                        payload: { pageId: page.id, splitAtIndex: 5 }
                    }
                });
            }

            // B. Fragmented Pages (Micro-pages)
            // Ignore if it's a special page or the only page
            if (blocks.length <= 1 && pages.length > 3 && index < pages.length - 1) {
                // Check if next page is also small or if we can merge down
                const nextPage = pages[index + 1];
                issues.push({
                    id: `fragment-page-${page.id}`,
                    category: "page_structure",
                    severity: "low",
                    title: "Page is very short",
                    description: `Page "${page.title}" has only ${blocks.length} block(s). Consider merging.`,
                    location: { pageId: page.id },
                    fixable: true,
                    suggestedFix: {
                        type: "merge_pages",
                        description: `Merge with next page "${nextPage.title}"`,
                        payload: { sourcePageId: page.id, targetPageId: nextPage.id }
                    }
                });
            }
        });

        return issues;
    }

    private analyzeBlockStructure(workflow: WorkflowJSON): OptimizationIssue[] {
        const issues: OptimizationIssue[] = [];
        const blocks = this.getAllBlocks(workflow);

        // 1. Duplicate Questions (Text matching)
        const titleMap = new Map<string, string[]>(); // Title -> BlockIDs
        blocks.forEach(b => {
            if (b.title && b.type !== 'display') {
                const key = b.title.trim().toLowerCase();
                if (!titleMap.has(key)) titleMap.set(key, []);
                titleMap.get(key)!.push(b.id);
            }
        });

        titleMap.forEach((ids, title) => {
            if (ids.length > 1) {
                issues.push({
                    id: `duplicate-question-${ids[0]}`,
                    category: "block_structure",
                    severity: "medium",
                    title: "Duplicate Question Text",
                    description: `The question "${title}" appears ${ids.length} times.`,
                    location: { blockId: ids[0] },
                    fixable: false, // Hard to autofix without knowing intent
                });
            }
        });

        // 2. Unused Variables
        // (Requires scanning all logic/prefills to see if variable is consumed. Skipping deep scan for MVP)

        return issues;
    }

    private analyzeLogic(workflow: WorkflowJSON): OptimizationIssue[] {
        const issues: OptimizationIssue[] = [];
        const blocks = this.getAllBlocks(workflow);

        blocks.forEach(block => {
            // Check for empty branches or constant conditions
            if (block.visibleIf) {
                const conditionStr = JSON.stringify(block.visibleIf);
                if (conditionStr.includes("true") && conditionStr.length < 20) { // Naive check for "always true"
                    issues.push({
                        id: `logic-always-true-${block.id}`,
                        category: "logic",
                        severity: "low",
                        title: "Redundant Condition",
                        description: `Block logic appears to be always true.`,
                        location: { blockId: block.id },
                        fixable: true,
                        suggestedFix: {
                            type: "simplify_logic",
                            description: "Remove condition",
                            payload: { blockId: block.id, action: "remove_condition" }
                        }
                    });
                }
            }
        });

        return issues;
    }

    private generateSuggestions(issues: OptimizationIssue[], workflow: WorkflowJSON): OptimizationSuggestion[] {
        const suggestions: OptimizationSuggestion[] = [];

        const longPages = issues.filter(i => i.id.startsWith("long-page"));
        if (longPages.length > 0) {
            suggestions.push({
                id: "sugg-split-pages",
                title: "Improve Mobile Completion",
                description: `Split ${longPages.length} long pages to reduce scroll depth and improve cognitive load.`,
                impact: "high",
                effort: "low",
                relatedIssues: longPages.map(i => i.id)
            });
        }

        const fragments = issues.filter(i => i.id.startsWith("fragment"));
        if (fragments.length > 2) {
            suggestions.push({
                id: "sugg-consolidate",
                title: "Consolidate Structure",
                description: `Merge ${fragments.length} fragmented pages to reduce click fatigue.`,
                impact: "medium",
                effort: "low",
                relatedIssues: fragments.map(i => i.id)
            });
        }

        return suggestions;
    }

    // =========================================================================
    // FIX APPLIERS
    // =========================================================================

    private applySplitPage(workflow: WorkflowJSON, payload: { pageId: string, splitAtIndex: number }) {
        const pageIndex = workflow.pages.findIndex(p => p.id === payload.pageId);
        if (pageIndex === -1) return;

        const page = workflow.pages[pageIndex];
        if (payload.splitAtIndex >= page.blocks.length) return;

        const blocksToMove = page.blocks.splice(payload.splitAtIndex);

        const newPage: WorkflowPage = {
            id: uuidv4(),
            title: `${page.title} (Continued)`,
            blocks: blocksToMove,
            order: page.order + 1 // We'll need to reorder subsequent pages
        };

        // Insert new page
        workflow.pages.splice(pageIndex + 1, 0, newPage);

        // Fix orders
        workflow.pages.forEach((p, idx) => { p.order = idx + 1; });
    }

    private applyMergePages(workflow: WorkflowJSON, payload: { sourcePageId: string, targetPageId: string }) {
        const sourceIdx = workflow.pages.findIndex(p => p.id === payload.sourcePageId);
        const targetIdx = workflow.pages.findIndex(p => p.id === payload.targetPageId);

        if (sourceIdx === -1 || targetIdx === -1) return;

        const sourcePage = workflow.pages[sourceIdx];
        const targetPage = workflow.pages[targetIdx];

        // Append blocks to target
        targetPage.blocks.push(...sourcePage.blocks);

        // Remove source page
        workflow.pages.splice(sourceIdx, 1);

        // Fix orders
        workflow.pages.forEach((p, idx) => { p.order = idx + 1; });
    }

    private applyDeleteBlock(workflow: WorkflowJSON, payload: { blockId: string }) {
        for (const page of workflow.pages) {
            const idx = page.blocks.findIndex(b => b.id === payload.blockId);
            if (idx !== -1) {
                page.blocks.splice(idx, 1);
                return;
            }
        }
    }

    private applyMoveBlock(workflow: WorkflowJSON, payload: { blockId: string, targetPageId: string, index: number }) {
        let block: WorkflowBlock | undefined;

        // Find and remove block
        for (const page of workflow.pages) {
            const idx = page.blocks.findIndex(b => b.id === payload.blockId);
            if (idx !== -1) {
                block = page.blocks.splice(idx, 1)[0];
                break;
            }
        }

        if (!block) return;

        // Insert into target
        const targetPage = workflow.pages.find(p => p.id === payload.targetPageId);
        if (targetPage) {
            if (payload.index >= 0 && payload.index <= targetPage.blocks.length) {
                targetPage.blocks.splice(payload.index, 0, block);
            } else {
                targetPage.blocks.push(block);
            }
        }
    }


    // =========================================================================
    // HELPER METHODS
    // =========================================================================

    private calculateMetrics(workflow: WorkflowJSON): WorkflowMetrics {
        const pages = workflow.pages || [];
        const blocks = this.getAllBlocks(workflow);

        // Simple Cyclomatic Complexity (count branches)
        let complexity = 1;
        blocks.forEach(b => {
            if (b.visibleIf) complexity++;
            if (b.type === 'branch') {
                const branches = b.config?.branches || []; // Cast safely
                complexity += branches.length;
            }
        });

        return {
            totalPages: pages.length,
            totalBlocks: blocks.length,
            avgBlocksPerPage: pages.length ? Number((blocks.length / pages.length).toFixed(1)) : 0,
            estimatedCompletionTimeMs: blocks.length * 15000,
            cyclomaticComplexity: complexity,
            unusedVariablesCount: 0, // Not implemented deeply
            readabilityScore: Math.max(0, 100 - (complexity / 2)) // Simple heuristic
        };
    }

    private calculateScore(issues: OptimizationIssue[], metrics: WorkflowMetrics): number {
        let score = 100;

        issues.forEach(issue => {
            switch (issue.severity) {
                case "critical": score -= 20; break;
                case "high": score -= 10; break;
                case "medium": score -= 5; break;
                case "low": score -= 2; break;
            }
        });

        // Penalize complexity
        if (metrics.cyclomaticComplexity > 50) score -= 10;

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    private getAllBlocks(workflow: WorkflowJSON): WorkflowBlock[] {
        let blocks: WorkflowBlock[] = [];
        const pages = workflow.pages || [];
        pages.forEach((p) => {
            if (p.blocks) blocks = blocks.concat(p.blocks);
        });
        return blocks;
    }
}

export const workflowOptimizationService = new WorkflowOptimizationService();
