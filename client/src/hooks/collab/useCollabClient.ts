import { useEffect, useRef, useState, useCallback } from 'react';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { WebSocketProvider } from './WebSocketProvider';

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
  updateCursor: (x: number, y: number) => void;
  updateMode: (mode: 'easy' | 'advanced') => void;
  updateActiveBlock: (blockId: string | null) => void;
  disconnect: () => void;
}

interface UseCollabClientOptions {
  workflowId: string;
  tenantId: string;
  token: string;
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
      awarenessRef.current?.off('change', handleAwarenessChange);
      provider.destroy();
      doc.destroy();
    };
    // Only depend on core connection parameters - callbacks are set up once

  }, [enabled, workflowId, tenantId, token]);

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
    updateCursor,
    updateMode,
    updateActiveBlock,
    disconnect,
  };
}
