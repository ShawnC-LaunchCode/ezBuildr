import { TransformBlock } from "shared/schema";

export function removeUnusedTransforms(transforms: TransformBlock[]): TransformBlock[] {
    // logic to remove transforms whose outputs are never read by subsequent transforms or final outputs
    // simplified implementation

    const usedVars = new Set<string>();
    // populate usedVars from document templates or explicit outputs

    return transforms.filter(t => {
        if (t.phase === 'onRunComplete') return true; // Always keep final transforms
        // if (t.outputPath && !usedVars.has(t.outputPath)) return false; 
        return true;
    });
}
