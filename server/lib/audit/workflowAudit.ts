interface WorkflowNode {
    id: string;
    next?: string; // Simple linear flow
    branches?: { next: string }[]; // Branching logic
}
interface WorkflowGraph {
    nodes: WorkflowNode[];
    startNodeId: string;
}
interface AuditResult {
    passed: boolean;
    issues: string[];
}
export class WorkflowAudit {
    static audit(graph: WorkflowGraph): AuditResult {
        const issues: string[] = [];
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        // 1. Detect Cycles (DFS)
        const hasCycle = (nodeId: string): boolean => {
            if (recursionStack.has(nodeId)) {return true;}
            if (visited.has(nodeId)) {return false;}
            visited.add(nodeId);
            recursionStack.add(nodeId);
            const node = graph.nodes.find(n => n.id === nodeId);
            if (!node) {
                issues.push(`Node ${nodeId} referenced but not found`);
                recursionStack.delete(nodeId);
                return false;
            }
            let cycleFound = false;
            if (node.next) {
                if (hasCycle(node.next)) {cycleFound = true;}
            }
            if (node.branches) {
                for (const branch of node.branches) {
                    if (hasCycle(branch.next)) {cycleFound = true;}
                }
            }
            recursionStack.delete(nodeId);
            return cycleFound;
        };
        if (hasCycle(graph.startNodeId)) {
            issues.push("Cycle detected in workflow graph");
        }
        // 2. Unreachable Nodes
        // 'visited' set now contains all reachable nodes from start
        const allNodeIds = graph.nodes.map(n => n.id);
        const unreachable = allNodeIds.filter(id => !visited.has(id));
        if (unreachable.length > 0) {
            issues.push(`Unreachable nodes detected: ${unreachable.join(', ')}`);
        }
        return {
            passed: issues.length === 0,
            issues
        };
    }
}