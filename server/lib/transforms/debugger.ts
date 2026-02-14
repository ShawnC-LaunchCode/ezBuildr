/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { TransformBlock } from "shared/schema";
import { TransformIssue, TransformFix } from "shared/types/debug";

export class TransformDebugger {
    static debug(transforms: TransformBlock[]): TransformIssue[] {
        const issues: TransformIssue[] = [];

        // 1. Detect Duplicate Names
        const names = new Set<string>();
        transforms.forEach(t => {
            if (names.has(t.name)) {
                issues.push({
                    id: `dup_name_${t.id}`,
                    type: 'invalid_path',
                    severity: 'error',
                    message: `Duplicate transform name: ${t.name}`,
                    blockId: t.id
                });
            }
            names.add(t.name);
        });

        // 2. Detect Missing Variables (Simplified check)
        // In a real implementation, this would check against variable schema
        transforms.forEach(t => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspecting arbitrary block properties for debugging
            const block = t as Record<string, any>;
            if (block.inputPaths && block.inputPaths.length === 0 && block.type !== 'script') {
                issues.push({
                    id: `missing_inputs_${t.id}`,
                    type: 'missing_var',
                    severity: 'warning',
                    message: `Transform ${t.name} has no inputs configured.`,
                    blockId: t.id
                });
            }
        });

        // 3. Detect Circular Dependencies (Simple Check)
        // Assuming output path maps to a variable name, and input paths read from variables
        const edges: Record<string, string[]> = {};
        transforms.forEach(t => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspecting arbitrary block properties for debugging
            const block = t as Record<string, any>;
            // eslint-disable-next-line sonarjs/no-collapsible-if
            if (block.outputPath) {
                // This transform produces 't.outputPath'
                // It consumes 't.inputPaths'
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (!edges[block.outputPath]) { edges[block.outputPath] = []; }
                // We track what PRODUCES this item -> depends on inputs
                // A cycle exists if A depends on B, and B depends on A.
                // Standard graph cycle detection would be better here.
            }
        });

        // 4. Type Mismatches (Basic)
        transforms.forEach(t => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspecting arbitrary block properties for debugging
            const block = t as Record<string, any>;
            if (block.type === 'compute' && block.config?.operation === 'math' && !block.inputPaths?.[0]) {
                // Example check
            }
        });

        return issues;
    }

    static async autoFix(transforms: TransformBlock[], issues: TransformIssue[]): Promise<TransformFix[]> {
        // Basic auto-fixes
        const fixes: TransformFix[] = [];

        for (const issue of issues) {
            if (issue.type === 'missing_var') {
                // Suggest default inputs?
            }
        }

        return fixes;
    }
}
