import { TransformBlock } from "shared/schema";

export function removeUnusedTransforms(transforms: TransformBlock[]): TransformBlock[] {
    // logic to remove transforms whose outputs are never read by subsequent transforms or final outputs
    // simplified implementation

    const _usedVars = new Set<string>();
    // populate usedVars from document templates or explicit outputs

    // TODO: Implement actual filtering logic using usedVars
    // For now, keep all transforms
    return [...transforms];
}
