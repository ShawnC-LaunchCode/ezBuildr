import { create } from 'zustand';

import type { Node, Edge, NodeChange, EdgeChange } from 'reactflow';

export interface BuilderNode extends Node {
  type: 'question' | 'compute' | 'branch' | 'template' | 'final';
  data: {
    label: string;
    config: Record<string, unknown>;
  };
}

export interface BuilderState {
  // Graph state
  nodes: BuilderNode[];
  edges: Edge[];
  selectedNodeId: string | null;

  // UI state
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;

  // Actions
  setNodes: (nodes: BuilderNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (type: BuilderNode['type'], position: { x: number; y: number }) => void;
  updateNode: (nodeId: string, data: Partial<BuilderNode['data']>) => void;
  deleteNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;

  // Graph operations
  onNodesChange: (changes: unknown[]) => void;
  onEdgesChange: (changes: unknown[]) => void;
  onConnect: (connection: Record<string, unknown>) => void;

  // Save state
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  setSaveError: (error: string | null) => void;

  // Load from API
  loadGraph: (graphJson: Record<string, unknown>) => void;

  // Export to API format
  exportGraph: () => Record<string, unknown>;

  // Power User Actions
  duplicateNode: (nodeId: string) => void;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  // Initial state
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isDirty: false,
  isSaving: false,
  saveError: null,

  // Actions
  setNodes: (nodes) => set({ nodes, isDirty: true }),

  setEdges: (edges) => set({ edges, isDirty: true }),

  addNode: (type, position) => {
    const state = get();
    const id = `node_${Date.now()}`;

    const newNode: BuilderNode = {
      id,
      type,
      position,
      data: {
        label: `${type.charAt(0).toUpperCase() + type.slice(1)} Node`,
        config: getDefaultConfig(type),
      },
    };

    set({
      nodes: [...state.nodes, newNode],
      isDirty: true,
      selectedNodeId: id,
    });
  },

  updateNode: (nodeId, data) => {
    const state = get();
    set({
      nodes: state.nodes.map(node =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node
      ),
      isDirty: true,
    });
  },

  deleteNode: (nodeId) => {
    const state = get();
    set({
      nodes: state.nodes.filter(node => node.id !== nodeId),
      edges: state.edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId),
      isDirty: true,
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
    });
  },

  duplicateNode: (nodeId) => {
    const state = get();
    const nodeToDuplicate = state.nodes.find(n => n.id === nodeId);
    if (!nodeToDuplicate) {return;}

    const newId = `node_${Date.now()}`;
    // Position slightly offset
    const newPosition = {
      x: nodeToDuplicate.position.x + 50,
      y: nodeToDuplicate.position.y + 50,
    };

    const newNode: BuilderNode = {
      ...nodeToDuplicate,
      id: newId,
      position: newPosition,
      data: {
        ...nodeToDuplicate.data,
        label: `${nodeToDuplicate.data.label} (Copy)`,
        // Deep copy config to avoid reference issues
        config: JSON.parse(JSON.stringify(nodeToDuplicate.data.config)) as Record<string, unknown>,
      },
      selected: true,
    };

    set({
      nodes: [...state.nodes.map(n => ({ ...n, selected: false })), newNode],
      isDirty: true,
      selectedNodeId: newId,
    });
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  onNodesChange: (changes) => {
    const state = get();
    const updatedNodes = applyNodeChanges(changes as NodeChange[], state.nodes);
    set({ nodes: updatedNodes, isDirty: true });
  },

  onEdgesChange: (changes) => {
    const state = get();
    const updatedEdges = applyEdgeChanges(changes as EdgeChange[], state.edges);
    set({ edges: updatedEdges, isDirty: true });
  },

  onConnect: (connection) => {
    const state = get();
    const conn = connection;
    const newEdge: Edge = {
      id: `edge_${Date.now()}`,
      source: conn.source as string,
      target: conn.target as string,
      sourceHandle: conn.sourceHandle as string | undefined,
      targetHandle: conn.targetHandle as string | undefined,
    };
    set({ edges: [...state.edges, newEdge], isDirty: true });
  },

  setDirty: (dirty) => set({ isDirty: dirty }),

  setSaving: (saving) => set({ isSaving: saving }),

  setSaveError: (error) => set({ saveError: error }),

  loadGraph: (graphJson) => {
    const graph = graphJson as { nodes?: unknown[]; edges?: unknown[] };
    if (graph.nodes == null) {
      set({ nodes: [], edges: [] });
      return;
    }

    // Convert API format to React Flow format
    const nodes: BuilderNode[] = graph.nodes.map((node: unknown, index: number) => {
      const n = node as Record<string, unknown>;
      const config = n.config as Record<string, unknown> | undefined;
      return {
        id: n.id as string,
        type: n.type as BuilderNode['type'],
        position: (n.position as { x: number; y: number }) ?? { x: 100 + index * 200, y: 100 + index * 100 },
        data: {
          label: (config?.label as string) ?? `${n.type as string} Node`,
          config: config ?? {},
        },
      };
    });

    const edges: Edge[] = ((graph.edges ?? [])).map((edge: unknown) => {
      const e = edge as Record<string, unknown>;
      return {
        id: e.id as string,
        source: e.source as string,
        target: e.target as string,
      };
    });

    set({ nodes, edges, isDirty: false });
  },

  exportGraph: () => {
    const state = get();

    return {
      nodes: state.nodes.map(node => ({
        id: node.id,
        type: node.type,
        position: node.position,
        config: node.data.config,
      })),
      edges: state.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
      startNodeId: state.nodes.length > 0 ? state.nodes[0].id : undefined,
    };
  },
}));

// Helper function to get default config for each node type
function getDefaultConfig(type: BuilderNode['type']): Record<string, unknown> {
  switch (type) {
    case 'question':
      return {
        label: 'New Question',
        key: `q_${Date.now()}`,
        inputType: 'text',
        required: false,
        condition: '',
      };
    case 'compute':
      return {
        expression: '',
        outputKey: `c_${Date.now()}`,
        condition: '',
      };
    case 'branch':
      return {
        branches: [],
        condition: '',
      };
    case 'template':
      return {
        templateId: '',
        bindings: {},
        condition: '',
      };
    case 'final':
      return {
        title: 'Completion',
        message: '### Thank you!\nYour submission has been received.',
        showDocuments: true,
        condition: '',
      };
    default:
      return {};
  }
}

// Helper to apply node changes (from React Flow)
function applyNodeChanges(changes: NodeChange[], nodes: BuilderNode[]): BuilderNode[] {
  const result = [...nodes];

  for (const change of changes) {
    const changeType = (change as Record<string, unknown>).type as string;
    const changeId = (change as Record<string, unknown>).id as string;
    switch (changeType) {
      case 'position': {
        const nodeIndex = result.findIndex(n => n.id === changeId);
        const position = (change as Record<string, unknown>).position as { x: number; y: number } | undefined;
        if (nodeIndex !== -1 && position != null) {
          result[nodeIndex] = {
            ...result[nodeIndex],
            position,
          };
        }
        break;
      }
      case 'remove':
        return result.filter(n => n.id !== changeId);
      case 'select': {
        const idx = result.findIndex(n => n.id === changeId);
        const selected = (change as Record<string, unknown>).selected as boolean | undefined;
        if (idx !== -1) {
          result[idx] = {
            ...result[idx],
            selected,
          };
        }
        break;
      }
    }
  }

  return result;
}

// Helper to apply edge changes (from React Flow)
function applyEdgeChanges(changes: EdgeChange[], edges: Edge[]): Edge[] {
  const result = [...edges];

  for (const change of changes) {
    const changeType = (change as Record<string, unknown>).type as string;
    const changeId = (change as Record<string, unknown>).id as string;
    switch (changeType) {
      case 'remove':
        return result.filter(e => e.id !== changeId);
      case 'select': {
        const idx = result.findIndex(e => e.id === changeId);
        const selected = (change as Record<string, unknown>).selected as boolean | undefined;
        if (idx !== -1) {
          result[idx] = {
            ...result[idx],
            selected,
          };
        }
        break;
      }
    }
  }

  return result;
}
