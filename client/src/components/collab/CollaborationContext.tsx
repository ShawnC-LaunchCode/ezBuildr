import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useCollabClient, CollabClientState, CollabClientActions } from '@/hooks/collab/useCollabClient';
import type { Node, Edge } from 'reactflow';

// We just need the state and actions, not the raw provider refs for now
type CollabContextType = CollabClientState & CollabClientActions;

const CollabContext = createContext<CollabContextType | null>(null);

interface CollaborationProviderProps {
    children: React.ReactNode;
    config: {
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
    };
    // If we want to sync graph changes (Nodes/Edges), we pass callbacks here.
    // For this specific 'UX' task, we might not be syncing the graph fully yet, 
    // but the hook requires these callbacks. 
    // We can pass empty, or pass the real ones if available from parent.
    onNodesChange?: (nodes: Node[]) => void;
    onEdgesChange?: (edges: Edge[]) => void;
}

export function CollaborationProvider({ children, config, onNodesChange, onEdgesChange }: CollaborationProviderProps) {
    const noOp = () => { };

    // Use the hook
    const collab = useCollabClient({
        workflowId: config.workflowId,
        tenantId: config.tenantId,
        token: config.token,
        enabled: config.enabled ?? true,
        user: config.user,
        onNodesChange: onNodesChange || noOp,
        onEdgesChange: onEdgesChange || noOp,
    });

    return (
        <CollabContext.Provider value={collab}>
            {children}
        </CollabContext.Provider>
    );
}

export function useCollaboration() {
    const context = useContext(CollabContext);
    if (!context) {
        throw new Error('useCollaboration must be used within a CollaborationProvider');
    }
    return context;
}

/**
 * Hook to get collaborators who are currently "editing" a specific block
 */
export function useBlockCollaborators(blockId: string) {
    const { users } = useCollaboration();

    // Filter users who have this block as their activeBlockId
    // Sort? Maybe by latest first?
    const editors = useMemo(() => {
        return users.filter(u => u.activeBlockId === blockId);
    }, [users, blockId]);

    const isLocked = editors.length > 0;

    return {
        editors,
        isLocked,
        lockedBy: editors[0] // Simplify to first editor for "locked by" text
    };
}
