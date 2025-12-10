import { PreviewEnvironment } from './PreviewEnvironment';
import type { ApiSection, ApiStep } from '@/lib/vault-api';

/**
 * HotReloadManager
 * 
 * Orchestrates hot reloads by listening for updates (e.g., from React Query or WebSocket)
 * and injecting them into the active PreviewEnvironment.
 */
export class HotReloadManager {
    private env: PreviewEnvironment | null = null;

    constructor() {
        // Listen for custom 'vault:schema-update' events if we add them later
        // or expose method to be called by React components
    }

    attach(env: PreviewEnvironment) {
        this.env = env;
        console.log('[HotReloadManager] Attached to environment:', env.getState().id);
    }

    detach() {
        this.env = null;
    }

    /**
     * Handle a schema update from the Builder
     */
    handleUpdate(workflowId: string, sections: ApiSection[], steps: ApiStep[]) {
        if (!this.env) return;

        // Verify workflow match
        if (this.env.getState().workflowId !== workflowId) {
            console.warn('[HotReloadManager] Update received for different workflow. Ignoring.');
            return;
        }

        // Perform hot Update
        this.env.updateSchema(sections, steps);

        // Optional: Notify UI (Toast is handled in UI layer, but we could emit event here)
        console.log('[HotReloadManager] Schema updated successfully');
    }
}

export const hotReloadManager = new HotReloadManager();
