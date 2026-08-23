import { TransformBlock } from "shared/schema";

export function reorderTransforms(transforms: TransformBlock[]): TransformBlock[] {
    // Topological sort based on dependencies
    // Logic: 
    // 1. Build dependency graph
    // 2. Sort
    // For now, simplify to just returning as-is or minor reordering based on 'phase'

    return transforms.sort((a, b) => {
        const phases = ['onRunStart', 'onPageEnter', 'onPageSubmit', 'onNext', 'onRunComplete'];
        const phaseDiff = phases.indexOf(a.phase) - phases.indexOf(b.phase);
        return phaseDiff !== 0 ? phaseDiff : a.order - b.order;
    });
}
