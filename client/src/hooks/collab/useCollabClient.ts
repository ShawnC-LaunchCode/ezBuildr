import { useEffect, useRef, useState, useCallback } from 'react';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

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
  mode?: 'easy' | 'advanced';
  activeBlockId?: string | null;
}

export interface CollabClientState {
  connected: boolean;
  synced: boolean;
  users: CollabUser[];

  error: string | null;
  user: {
    id: string;
    name: string;
    color: string;
    email?: string;
  };
}

export interface CollabClientActions {
  updateNodes: (nodes: Node[]) => void;
  updateEdges: (edges: Edge[]) => void;
  updateCursor: (x: number, y: number) => void;
  updateSelectedNode: (nodeId: string | null) => void;
  updateMode: (mode: 'easy' | 'advanced') => void;
  updateActiveBlock: (blockId: string | null) => void;
  disconnect: () => void;
}

interface UseCollabClientOptions {
  workflowId: string;
  tenantId: string;
  token: string;
  onNodesChange: (nodes: Node[]) => void;
  onEdgesChange: (edges: Edge[]) => void;
  enabled?: boolean;
  user: {
    id: string;
    name: string;
    color: string;
    email?: string;
  };
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
    user,
  } = options;

  const [state, setState] = useState<CollabClientState>({
    connected: false,
    synced: false,
    users: [],

    error: null,
    user,
  });

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebSocketProvider | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const isLocalUpdateRef = useRef(false);

  // Room key format: tenant:{tenantId}:workflow:{workflowId}
  const roomKey = `tenant:${tenantId}:workflow:${workflowId}`;

  // Initialize Yjs document and WebSocket provider
  useEffect(() => {
    if (!enabled || !token) {return;}

    const doc = new Y.Doc();
    docRef.current = doc;

    // Get WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use the same host/port as the application (no separate port needed)
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
    doc.getMap('yMeta');

    // Initialize comments map
    doc.getMap('yComments');

    // Set local user state
    provider.awareness.setLocalStateField('user', {
      userId: user.id,
      displayName: user.name,
      color: user.color,
      email: user.email ?? '',
      role: 'editor', // Default role
      activeBlockId: null,
      mode: 'easy', // Default mode
      lastActive: Date.now()
    });

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
    const yNodes = yGraph.get('nodes') as Y.Array<Y.Map<unknown>>;
    const yEdges = yGraph.get('edges') as Y.Array<Y.Map<unknown>>;

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const handleNodesChange = () => {
      if (isLocalUpdateRef.current) {return;}

      const nodes = yNodes.toArray().map((yNode) => {
        const node: Record<string, unknown> = {};
        yNode.forEach((value, key) => {
          node[key] = value;
        });
        return node as unknown as Node;
      });

      onNodesChange(nodes);
    };

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const handleEdgesChange = () => {
      if (isLocalUpdateRef.current) {return;}

      const edges = yEdges.toArray().map((yEdge) => {
        const edge: Record<string, unknown> = {};
        yEdge.forEach((value, key) => {
          edge[key] = value;
        });
        return edge as unknown as Edge;
      });

      onEdgesChange(edges);
    };

    yNodes.observe(handleNodesChange);
    yEdges.observe(handleEdgesChange);

    // Observe awareness changes (other users)
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const handleAwarenessChange = () => {
      const awareness = awarenessRef.current;
      if (!awareness) {return;}
      const states = Array.from(awareness.getStates().values());
      const usersMap = new Map<string, CollabUser>();

      for (const state of states) {
        const stateObj = state as Record<string, unknown>;
        if (stateObj.user) {
          const u = stateObj.user as CollabUser;
          usersMap.set(u.userId, u);
        }
      }

      const users = Array.from(usersMap.values());
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
    // Only depend on core connection parameters - callbacks are set up once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, workflowId, tenantId, token]);

  // Update nodes in Yjs document
  const updateNodes = useCallback((nodes: Node[]) => {
    if (!docRef.current) {return;}

    const yGraph = docRef.current.getMap('yGraph');
    const yNodes = yGraph.get('nodes') as Y.Array<Y.Map<unknown>>;

    isLocalUpdateRef.current = true;

    docRef.current.transact(() => {
      // Clear and rebuild array
      yNodes.delete(0, yNodes.length);

      nodes.forEach((node) => {
        const yNode = new Y.Map();
        // eslint-disable-next-line max-nested-callbacks
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
    if (!docRef.current) {return;}

    const yGraph = docRef.current.getMap('yGraph');
    const yEdges = yGraph.get('edges') as Y.Array<Y.Map<unknown>>;

    isLocalUpdateRef.current = true;

    docRef.current.transact(() => {
      // Clear and rebuild array
      yEdges.delete(0, yEdges.length);

      edges.forEach((edge) => {
        const yEdge = new Y.Map();
        // eslint-disable-next-line max-nested-callbacks
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
    if (!awarenessRef.current) {return;}

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
    if (!awarenessRef.current) {return;}

    const currentState = awarenessRef.current.getLocalState();
    if (currentState?.user) {
      awarenessRef.current.setLocalStateField('user', {
        ...currentState.user,
        selectedNodeId: nodeId,
        lastActive: Date.now(),
      });
    }
  }, []);

  // Update user mode
  const updateMode = useCallback((mode: 'easy' | 'advanced') => {
    if (!awarenessRef.current) {return;}

    const currentState = awarenessRef.current.getLocalState();
    if (currentState?.user) {
      awarenessRef.current.setLocalStateField('user', {
        ...currentState.user,
        mode,
        lastActive: Date.now(),
      });
    }
  }, []);

  // Update active block (locking/presence)
  const updateActiveBlock = useCallback((blockId: string | null) => {
    if (!awarenessRef.current) {return;}

    const currentState = awarenessRef.current.getLocalState();
    if (currentState?.user) {
      // Optimize: Don't update if same
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (currentState.user.activeBlockId === blockId) {return;}

      awarenessRef.current.setLocalStateField('user', {
        ...currentState.user,
        activeBlockId: blockId,
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
    updateMode,
    updateActiveBlock,
    disconnect,
  };
}
