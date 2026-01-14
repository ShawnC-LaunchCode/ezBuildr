import { create } from 'zustand';

import type { Node, Edge } from 'reactflow';

export interface BuilderNode extends Node {
  type: 'question' | 'compute' | 'branch' | 'template' | 'final';
  data: {
    label: string;
    config: any;
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
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (connection: any) => void;

  // Save state
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  setSaveError: (error: string | null) => void;

  // Load from API
  loadGraph: (graphJson: any) => void;

  // Export to API format
  exportGraph: () => any;

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
        config: JSON.parse(JSON.stringify(nodeToDuplicate.data.config)),
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
    const updatedNodes = applyNodeChanges(changes, state.nodes);
    set({ nodes: updatedNodes, isDirty: true });
  },

  onEdgesChange: (changes) => {
    const state = get();
    const updatedEdges = applyEdgeChanges(changes, state.edges);
    set({ edges: updatedEdges, isDirty: true });
  },

  onConnect: (connection) => {
    const state = get();
    const newEdge: Edge = {
      id: `edge_${Date.now()}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
    };
    set({ edges: [...state.edges, newEdge], isDirty: true });
  },

  setDirty: (dirty) => set({ isDirty: dirty }),

  setSaving: (saving) => set({ isSaving: saving }),

  setSaveError: (error) => set({ saveError: error }),

  loadGraph: (graphJson) => {
    if (!graphJson?.nodes) {
      set({ nodes: [], edges: [] });
      return;
    }

    // Convert API format to React Flow format
    const nodes: BuilderNode[] = graphJson.nodes.map((node: any, index: number) => ({
      id: node.id,
      type: node.type,
      position: node.position || { x: 100 + index * 200, y: 100 + index * 100 },
      data: {
        label: node.config?.label || `${node.type} Node`,
        config: node.config,
      },
    }));

    const edges: Edge[] = (graphJson.edges || []).map((edge: any) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    }));

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
function getDefaultConfig(type: BuilderNode['type']): any {
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
function applyNodeChanges(changes: any[], nodes: BuilderNode[]): BuilderNode[] {
  const result = [...nodes];

  for (const change of changes) {
    switch (change.type) {
      case 'position':
        const nodeIndex = result.findIndex(n => n.id === change.id);
        if (nodeIndex !== -1 && change.position) {
          result[nodeIndex] = {
            ...result[nodeIndex],
            position: change.position,
          };
        }
        break;
      case 'remove':
        return result.filter(n => n.id !== change.id);
      case 'select':
        const idx = result.findIndex(n => n.id === change.id);
        if (idx !== -1) {
          result[idx] = {
            ...result[idx],
            selected: change.selected,
          };
        }
        break;
    }
  }

  return result;
}

// Helper to apply edge changes (from React Flow)
function applyEdgeChanges(changes: any[], edges: Edge[]): Edge[] {
  const result = [...edges];

  for (const change of changes) {
    switch (change.type) {
      case 'remove':
        return result.filter(e => e.id !== change.id);
      case 'select':
        const idx = result.findIndex(e => e.id === change.id);
        if (idx !== -1) {
          result[idx] = {
            ...result[idx],
            selected: change.selected,
          };
        }
        break;
    }
  }

  return result;
}
