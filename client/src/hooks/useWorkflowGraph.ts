
import { useWorkflowBuilder } from "@/store/workflow-builder";

export function useWorkflowGraph() {
    const state = useWorkflowBuilder();
    return {
        nodes: [],
        edges: [],
        ...state
    };
}
