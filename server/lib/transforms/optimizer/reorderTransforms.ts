import { TransformBlock } from "shared/schema";

export function reorderTransforms(transforms: TransformBlock[]): TransformBlock[] {
    // Topological sort based on dependencies
    // Logic: 
    // 1. Build dependency graph
    // 2. Sort
    // For now, simplify to just returning as-is or minor reordering based on 'phase'

    return transforms.sort((a, b) => {
        const phases = ['onRunStart', 'onSectionEnter', 'onSectionSubmit', 'onNext', 'onRunComplete'];
        return phases.indexOf(a.phase) - phases.indexOf(b.phase) || a.order - b.order;
    });
}
