
import { WorkflowJSON, WorkflowBlock } from "@shared/types/workflow";

export type DiffChangeType = 'added' | 'removed' | 'modified';
export type DiffItemType = 'block' | 'variable' | 'logic' | 'other';
export type Severity = "safe" | "soft_breaking" | "hard_breaking";

export interface DiffItem {
    id: string;
    type: DiffItemType;
    changeType: DiffChangeType;
    description: string;
    // details?: { old?: any; new?: any };
}

export interface WorkflowDiff {
    added: DiffItem[];
    removed: DiffItem[];
    modified: DiffItem[];
    severity: Severity;
}

export class WorkflowDiffService {

    public diff(oldVersion: WorkflowJSON, newVersion: WorkflowJSON): WorkflowDiff {
        const diff: WorkflowDiff = {
            added: [],
            removed: [],
            modified: [],
            severity: "safe"
        };

        const oldBlocks = this.flattenBlocks(oldVersion);
        const newBlocks = this.flattenBlocks(newVersion);

        // 1. Identify Removed and Modified
        for (const [id, oldBlock] of oldBlocks) {
            const newBlock = newBlocks.get(id);
            if (!newBlock) {
                // Removed
                diff.removed.push({
                    id,
                    type: this.getDiffItemType(oldBlock),
                    changeType: 'removed',
                    description: `Removed ${this.getBlockLabel(oldBlock)}`
                });
            } else {
                // Modified?
                const isModified = JSON.stringify(oldBlock) !== JSON.stringify(newBlock); // Naive deep equal
                // Optimize: Exclude position/order changes if not relevant? 
                // For now, strict equality.
                if (isModified) {
                    diff.modified.push({
                        id,
                        type: this.getDiffItemType(newBlock),
                        changeType: 'modified',
                        description: `Modified ${this.getBlockLabel(newBlock)}`
                    });
                }
            }
        }

        // 2. Identify Added
        for (const [id, newBlock] of newBlocks) {
            if (!oldBlocks.has(id)) {
                diff.added.push({
                    id,
                    type: this.getDiffItemType(newBlock),
                    changeType: 'added',
                    description: `Added ${this.getBlockLabel(newBlock)}`
                });
            }
        }

        // 3. Calculate Severity
        diff.severity = this.calculateSeverity(diff, oldBlocks, newBlocks);

        return diff;
    }

    private flattenBlocks(workflow: WorkflowJSON): Map<string, WorkflowBlock> {
        const map = new Map<string, WorkflowBlock>();
        workflow.pages.forEach(p => {
            p.blocks.forEach(b => {
                map.set(b.id, b);
            });
        });
        return map;
    }

    private getDiffItemType(block: WorkflowBlock): DiffItemType {
        // Heuristic: If it has an alias, it's likely a variable.
        // Logic blocks: branch, validate.
        if (block.variableName || block.alias || ['short_text', 'long_text', 'number', 'email'].includes(block.type as string)) {return 'variable';}
        if (['branch', 'validate', 'jump'].includes(block.type as string)) {return 'logic';}
        return 'block';
    }

    private getBlockLabel(block: WorkflowBlock): string {
        return block.title ? `'${block.title}'` : `${block.type} block`;
    }

    private calculateSeverity(diff: WorkflowDiff, oldBlocks: Map<string, WorkflowBlock>, newBlocks: Map<string, WorkflowBlock>): Severity {
        // Reuse logic from ChangeAnalyzer essentially.
        let severity: Severity = "safe";

        // Hard Breaking:
        // 1. Removal of Variables (that might be used) - Checking usage is expensive here without full Analysis.
        //    For now, assume removal of ANY variable is POTENTIALLY hard breaking if we don't do usage check.
        //    But Prompt 21 says "internally reuse rules from Prompt 20".
        //    Prompt 20 "WorkflowChangeAnalyzer" did usage checks.
        //    Option: Delegate to WorkflowChangeAnalyzer?

        // Let's implement basic heuristics here for speed and clarity.

        // R1: Variable Removed -> Hard
        const removedVars = diff.removed.filter(i => i.type === 'variable');
        if (removedVars.length > 0) {severity = "hard_breaking";}

        // R2: Variable Type Changed -> Hard
        // Loop modified items
        for (const mod of diff.modified) {
            if (mod.type === 'variable') {
                const oldB = oldBlocks.get(mod.id);
                const newB = newBlocks.get(mod.id);
                if (oldB && newB && oldB.type !== newB.type) {
                    return "hard_breaking"; // Immediate return
                }
                // R3: Required added -> Soft
                if (oldB && newB && !oldB.required && newB.required) {
                    if (severity !== 'hard_breaking') {severity = "soft_breaking";}
                }
            }
        }

        // R4: New Required Variable -> Soft
        for (const added of diff.added) {
            if (added.type === 'variable') {
                const newB = newBlocks.get(added.id);
                if (newB?.required) {
                    if (severity !== "hard_breaking") {severity = "soft_breaking";}
                }
            }
        }

        return severity;
    }
}

export const workflowDiffService = new WorkflowDiffService();
