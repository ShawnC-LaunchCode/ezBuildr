import { WorkflowJSON, WorkflowBlock } from "@shared/types/workflow";
import { ChangeImpactReport, ChangeReason, Severity } from "./types";
export class WorkflowChangeAnalyzer {
    /**
     * Analyzes changes between two workflow versions and returns an impact report.
     * @param oldVersion The baseline version (e.g., current published).
     * @param newVersion The target version (e.g., draft or next version).
     */
    public analyze(oldVersion: WorkflowJSON, newVersion: WorkflowJSON): ChangeImpactReport {
        const report: ChangeImpactReport = {
            severity: "safe",
            reasons: [],
            affectedSystems: {
                snapshots: false,
                documents: false,
                dataWrites: false,
                externalSends: false
            }
        };
        // 1. Flatten items for easy lookup
        const oldItems = this.flattenWorkflow(oldVersion);
        const newItems = this.flattenWorkflow(newVersion);
        // 2. Analyze Deleted/Changed Variables
        for (const [id, oldBlock] of oldItems) {
            const newBlock = newItems.get(id);
            if (!newBlock) {
                // Block/Variable Deleted
                this.checkDeletionImpact(id, oldBlock, newItems, report);
            } else {
                // Block/Variable Changed
                this.checkModificationImpact(oldBlock, newBlock, report);
            }
        }
        // 3. Analyze New Variables (Soft Breaking mostly)
        for (const [id, newBlock] of newItems) {
            if (!oldItems.has(id)) {
                this.checkAdditionImpact(newBlock, report);
            }
        }
        // 4. Aggregation Severity
        report.severity = this.calculateOverallSeverity(report.reasons);
        return report;
    }
    private flattenWorkflow(workflow: WorkflowJSON): Map<string, WorkflowBlock> {
        const map = new Map<string, WorkflowBlock>();
        workflow.pages.forEach(page => {
            page.blocks.forEach(block => {
                map.set(block.id, block);
            });
        });
        return map;
    }
    private checkDeletionImpact(id: string, oldBlock: WorkflowBlock, newItems: Map<string, WorkflowBlock>, report: ChangeImpactReport) {
        // Simple heuristic: If it's a step (variable), deleting it is RISKY.
        // We need usage detection to be precise, but for now, let's assume if it was a data-bearing step, it's Hard Breaking.
        const type = oldBlock.type;
        // Check if it was a variable-bearing step
        const isVariable = !["prefill", "validate", "branch", "delete_record", "display"].includes(type as string);
        if (isVariable) {
            const alias = oldBlock.alias || oldBlock.variableName; // Check both legacy and new props
            // Check usage in NEW version to see if anything breaks
            const usage = this.findUsage(id, alias, newItems);
            if (usage.length > 0) {
                report.reasons.push({
                    severity: "hard_breaking",
                    message: `Variable '${oldBlock.title || id}' was deleted but is still referenced by: ${usage.join(", ")}`,
                    targetId: id,
                    targetType: "variable"
                });
                // Set affected systems based on usage types
                report.affectedSystems.snapshots = true;
                report.affectedSystems.documents = usage.some(u => u.includes("Document"));
                report.affectedSystems.dataWrites = usage.some(u => u.includes("Write") || u.includes("Record"));
                report.affectedSystems.externalSends = usage.some(u => u.includes("External"));
            } else {
                // Deleted but unused - Safe? Or Soft if it was required?
                // Let's say Soft for now as it alters schema.
                report.reasons.push({
                    severity: "soft_breaking",
                    message: `Variable '${oldBlock.title || id}' was deleted. Snapshots containing this data may be incomplete.`,
                    targetId: id,
                    targetType: "variable"
                });
                report.affectedSystems.snapshots = true;
            }
        }
    }
    private checkModificationImpact(oldBlock: WorkflowBlock, newBlock: WorkflowBlock, report: ChangeImpactReport) {
        // Type Change
        if (oldBlock.type !== newBlock.type) {
            report.reasons.push({
                severity: "hard_breaking",
                message: `Variable '${oldBlock.title || oldBlock.id}' changed type from ${oldBlock.type} to ${newBlock.type}.`,
                targetId: oldBlock.id,
                targetType: "variable"
            });
            report.affectedSystems.snapshots = true;
        }
        // Required Flag Change (Soft Breaking)
        if (!oldBlock.required && newBlock.required) {
            report.reasons.push({
                severity: "soft_breaking",
                message: `Variable '${oldBlock.title || oldBlock.id}' is now required.`,
                targetId: oldBlock.id,
                targetType: "variable"
            });
            report.affectedSystems.snapshots = true;
        }
        // TODO: Deep check on config changes (e.g. column mapping changes)
    }
    private checkAdditionImpact(newBlock: WorkflowBlock, report: ChangeImpactReport) {
        if (newBlock.required) {
            report.reasons.push({
                severity: "soft_breaking",
                message: `New required variable '${newBlock.title || newBlock.id}' added.`,
                targetId: newBlock.id,
                targetType: "variable"
            });
            report.affectedSystems.snapshots = true; // Snapshots won't have this value
        }
    }
    // Helper to build alias map
    private buildAliasMap(items: Map<string, WorkflowBlock>): Map<string, string> {
        const aliasMap = new Map<string, string>(); // ID -> Alias
        for (const [id, block] of items) {
            if (block.alias) {
                aliasMap.set(id, block.alias);
            }
        }
        return aliasMap;
    }
    // Reverse map for lookup
    private buildReverseAliasMap(items: Map<string, WorkflowBlock>): Map<string, string> {
        const revMap = new Map<string, string>(); // Alias -> ID
        for (const [id, block] of items) {
            if (block.alias) {
                revMap.set(block.alias, id);
            }
        }
        return revMap;
    }
    private findUsage(targetId: string, targetAlias: string | undefined, items: Map<string, WorkflowBlock>): string[] {
        const usages: string[] = [];
        for (const [id, block] of items) {
            // Check config for references
            // 1. JS Question inputs
            if (block.type === 'js_question' && block.config) {
                const inputs = (block.config.inputKeys as string[]) || [];
                if (inputs.includes(targetId) || (targetAlias && inputs.includes(targetAlias))) {
                    usages.push(`JS Block '${block.title || id}'`);
                }
            }
            // 2. Logic (References in visibleIf) - Simple String Match for now (imperfect but safe)
            if (block.visibleIf) {
                const json = JSON.stringify(block.visibleIf);
                if (json.includes(targetId) || (targetAlias && json.includes(`"${targetAlias}"`))) {
                    usages.push(`Logic in '${block.title || id}'`);
                }
            }
            // 3. Data writes (Create/Update Record)
            if ((block.type === 'create_record' || block.type === 'update_record') && block.config?.fieldMap) {
                const map = block.config.fieldMap as Record<string, string>;
                const values = Object.values(map);
                if (values.includes(targetId) || (targetAlias && values.includes(targetAlias))) {
                    usages.push(`Record Write '${block.title || id}'`);
                }
            }
            // 4. External Sends
            if ((block.type as string) === 'external_send' && block.config?.payloadMappings) {
                const mappings = block.config.payloadMappings as Array<{ key: string, value: string }>;
                // Value can be expression or direct ref
                for (const m of mappings) {
                    if (m.value.includes(targetId) || (targetAlias && m.value.includes(targetAlias))) {
                        usages.push(`External Send '${block.title || id}'`);
                    }
                }
            }
        }
        return usages;
    }
    private calculateOverallSeverity(reasons: ChangeReason[]): Severity {
        if (reasons.some(r => r.severity === "hard_breaking")) {return "hard_breaking";}
        if (reasons.some(r => r.severity === "soft_breaking")) {return "soft_breaking";}
        return "safe";
    }
}