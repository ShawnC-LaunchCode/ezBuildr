import type { ApiPage, ApiStep } from '@/lib/vault-api';

import { createLogger } from '../logger';

import { PreviewEnvironment } from './PreviewEnvironment';

/**
 * HotReloadManager
 * 
 * Orchestrates hot reloads by listening for updates (e.g., from React Query or WebSocket)
 * and injecting them into the active PreviewEnvironment.
 */
export class HotReloadManager {
    private logger = createLogger({ module: 'HotReloadManager' });
    private env: PreviewEnvironment | null = null;

    constructor() {
        // Listen for custom 'vault:schema-update' events if we add them later
        // or expose method to be called by React components
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    attach(env: PreviewEnvironment) {
        this.env = env;
        this.logger.info('Attached to environment:', env.getState().id);
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    detach() {
        this.env = null;
        this.logger.info('Detached from environment');
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    updateSchema(pages: ApiPage[], steps: ApiStep[]) {
        if (!this.env) {
            this.logger.warn('Cannot update schema: No environment attached');
            return;
        }

        // Perform hot Update
        this.env.updateSchema(pages, steps);

        // Optional: Notify UI (Toast is handled in UI layer, but we could emit event here)
        this.logger.info('Schema updated successfully');
    }
}

export const hotReloadManager = new HotReloadManager();
