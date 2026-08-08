import React, { createContext, useContext, useMemo } from 'react';

import { useCollabClient, CollabClientState, CollabClientActions } from '@/hooks/collab/useCollabClient';

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
}
export function CollaborationProvider({ children, config }: CollaborationProviderProps) {
    // Use the hook
    const collab = useCollabClient({
        workflowId: config.workflowId,
        tenantId: config.tenantId,
        token: config.token,
        enabled: config.enabled ?? true,
        user: config.user,
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