
import { useWorkflowBuilder } from "@/store/workflow-builder";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useWorkflowGraph() {
    const state = useWorkflowBuilder();
    return {
        nodes: [],
        edges: [],
        ...state
    };
}
