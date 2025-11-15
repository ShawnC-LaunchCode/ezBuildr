import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { WebSocketProvider } from './WebSocketProvider';
import type { Node, Edge } from 'reactflow';

export interface CollabUser {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  color: string;
  cursor?: { x: number; y: number };
  selectedNodeId?: string | null;
}

export interface CollabClientState {
  connected: boolean;
  synced: boolean;
  users: CollabUser[];
  error: string | null;
}

export interface CollabClientActions {
  updateNodes: (nodes: Node[]) => void;
  updateEdges: (edges: Edge[]) => void;
  updateCursor: (x: number, y: number) => void;
  updateSelectedNode: (nodeId: string | null) => void;
  disconnect: () => void;
}

interface UseCollabClientOptions {
  workflowId: string;
  tenantId: string;
  token: string;
  onNodesChange: (nodes: Node[]) => void;
  onEdgesChange: (edges: Edge[]) => void;
  enabled?: boolean;
}

/**
 * React hook for real-time collaboration on workflow graphs
 */
export function useCollabClient(
  options: UseCollabClientOptions
): CollabClientState & CollabClientActions {
  const {
    workflowId,
    tenantId,
    token,
    onNodesChange,
    onEdgesChange,
    enabled = true,
  } = options;

  const [state, setState] = useState<CollabClientState>({
    connected: false,
    synced: false,
    users: [],
    error: null,
  });

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebSocketProvider | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const isLocalUpdateRef = useRef(false);

  // Room key format: tenant:{tenantId}:workflow:{workflowId}
  const roomKey = `tenant:${tenantId}:workflow:${workflowId}`;

  // Initialize Yjs document and WebSocket provider
  useEffect(() => {
    if (!enabled || !token) return;

    const doc = new Y.Doc();
    docRef.current = doc;

    // Get WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/collab`;

    // Create WebSocket provider
    const provider = new WebSocketProvider(wsUrl, roomKey, doc, {
      params: { token },
      awareness: new Awareness(doc),
    });

    providerRef.current = provider;
    awarenessRef.current = provider.awareness;

    // Setup Yjs document structure
    const yGraph = doc.getMap('yGraph');
    if (!yGraph.has('nodes')) {
      yGraph.set('nodes', new Y.Array());
    }
    if (!yGraph.has('edges')) {
      yGraph.set('edges', new Y.Array());
    }

    // Initialize meta map
    if (!(doc as any).has('yMeta')) {
      doc.getMap('yMeta');
    }

    // Initialize comments map
    if (!(doc as any).has('yComments')) {
      doc.getMap('yComments');
    }

    // Connection event handlers
    provider.on('status', ({ status }: { status: string }) => {
      setState((prev) => ({
        ...prev,
        connected: status === 'connected',
        error: status === 'disconnected' ? 'Disconnected from server' : null,
      }));
    });

    provider.on('sync', (isSynced: boolean) => {
      setState((prev) => ({ ...prev, synced: isSynced }));
    });

    // Observe changes from remote
    const yNodes = yGraph.get('nodes') as Y.Array<Y.Map<any>>;
    const yEdges = yGraph.get('edges') as Y.Array<Y.Map<any>>;

    const handleNodesChange = () => {
      if (isLocalUpdateRef.current) return;

      const nodes = yNodes.toArray().map((yNode) => {
        const node: any = {};
        yNode.forEach((value, key) => {
          node[key] = value;
        });
        return node;
      });

      onNodesChange(nodes);
    };

    const handleEdgesChange = () => {
      if (isLocalUpdateRef.current) return;

      const edges = yEdges.toArray().map((yEdge) => {
        const edge: any = {};
        yEdge.forEach((value, key) => {
          edge[key] = value;
        });
        return edge;
      });

      onEdgesChange(edges);
    };

    yNodes.observe(handleNodesChange);
    yEdges.observe(handleEdgesChange);

    // Observe awareness changes (other users)
    const handleAwarenessChange = () => {
      const states = Array.from(awarenessRef.current!.getStates().values());
      const users = states
        .filter((state: any) => state.user)
        .map((state: any) => state.user);

      setState((prev) => ({ ...prev, users }));
    };

    awarenessRef.current.on('change', handleAwarenessChange);

    // Cleanup
    return () => {
      yNodes.unobserve(handleNodesChange);
      yEdges.unobserve(handleEdgesChange);
      awarenessRef.current?.off('change', handleAwarenessChange);
      provider.destroy();
      doc.destroy();
    };
  }, [enabled, workflowId, tenantId, token, roomKey, onNodesChange, onEdgesChange]);

  // Update nodes in Yjs document
  const updateNodes = useCallback((nodes: Node[]) => {
    if (!docRef.current) return;

    const yGraph = docRef.current.getMap('yGraph');
    const yNodes = yGraph.get('nodes') as Y.Array<Y.Map<any>>;

    isLocalUpdateRef.current = true;

    docRef.current.transact(() => {
      // Clear and rebuild array
      yNodes.delete(0, yNodes.length);

      nodes.forEach((node) => {
        const yNode = new Y.Map();
        Object.entries(node).forEach(([key, value]) => {
          // Serialize complex objects as JSON
          if (typeof value === 'object' && value !== null) {
            yNode.set(key, JSON.parse(JSON.stringify(value)));
          } else {
            yNode.set(key, value);
          }
        });
        yNodes.push([yNode]);
      });
    });

    // Reset flag after a short delay
    setTimeout(() => {
      isLocalUpdateRef.current = false;
    }, 50);
  }, []);

  // Update edges in Yjs document
  const updateEdges = useCallback((edges: Edge[]) => {
    if (!docRef.current) return;

    const yGraph = docRef.current.getMap('yGraph');
    const yEdges = yGraph.get('edges') as Y.Array<Y.Map<any>>;

    isLocalUpdateRef.current = true;

    docRef.current.transact(() => {
      // Clear and rebuild array
      yEdges.delete(0, yEdges.length);

      edges.forEach((edge) => {
        const yEdge = new Y.Map();
        Object.entries(edge).forEach(([key, value]) => {
          // Serialize complex objects as JSON
          if (typeof value === 'object' && value !== null) {
            yEdge.set(key, JSON.parse(JSON.stringify(value)));
          } else {
            yEdge.set(key, value);
          }
        });
        yEdges.push([yEdge]);
      });
    });

    // Reset flag after a short delay
    setTimeout(() => {
      isLocalUpdateRef.current = false;
    }, 50);
  }, []);

  // Update cursor position
  const updateCursor = useCallback((x: number, y: number) => {
    if (!awarenessRef.current) return;

    const currentState = awarenessRef.current.getLocalState();
    if (currentState?.user) {
      awarenessRef.current.setLocalStateField('user', {
        ...currentState.user,
        cursor: { x, y },
        lastActive: Date.now(),
      });
    }
  }, []);

  // Update selected node
  const updateSelectedNode = useCallback((nodeId: string | null) => {
    if (!awarenessRef.current) return;

    const currentState = awarenessRef.current.getLocalState();
    if (currentState?.user) {
      awarenessRef.current.setLocalStateField('user', {
        ...currentState.user,
        selectedNodeId: nodeId,
        lastActive: Date.now(),
      });
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (providerRef.current) {
      providerRef.current.destroy();
    }
    if (docRef.current) {
      docRef.current.destroy();
    }
  }, []);

  return {
    ...state,
    updateNodes,
    updateEdges,
    updateCursor,
    updateSelectedNode,
    disconnect,
  };
}
