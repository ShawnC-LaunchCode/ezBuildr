/**
 * Analytics Client
 * Handles sending analytics events to the backend.
 * Gracefully handles failures to avoid disrupting the user experience.
 */

export interface AnalyticsEvent {
    runId: string;
    workflowId: string;
    versionId: string;
    type: string;
    blockId?: string;
    pageId?: string;
    payload?: Record<string, any>;
    timestamp?: string; // ISO string
    isPreview?: boolean;
}

class AnalyticsClient {
    private queue: AnalyticsEvent[] = [];
    private flushInterval: number | null = null;
    private FLUSH_DELAY = 1000;

    /**
     * Record an analytics event.
     * Events are queued and flushed in batches (not implemented yet, simple immediate send for now).
     */
    async record(event: AnalyticsEvent) {
        if (!event.runId || !event.workflowId) {
            // Silently skip - analytics is optional
            return;
        }

        // Add timestamp if missing
        if (!event.timestamp) {
            event.timestamp = new Date().toISOString();
        }

        try {
            await fetch('/api/workflow-analytics/events', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(event),
                keepalive: true // Ensure request survives page navigation
            });
        } catch (error) {
            // Silently fail - analytics is optional and should not clutter console
            // Only log in development if needed for debugging
            if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_ANALYTICS) {
                console.warn('[Analytics] Failed to send event', error);
            }
        }
    }

    /**
     * Helper to record page view
     */
    async pageView(runId: string, workflowId: string, versionId: string, pageId: string, isPreview = false) {
        await this.record({
            runId,
            workflowId,
            versionId,
            type: 'page.view',
            pageId,
            isPreview
        });
    }

    /**
     * Helper to record run start
     */
    async runStart(runId: string, workflowId: string, versionId: string, isPreview = false) {
        await this.record({
            runId,
            workflowId,
            versionId,
            type: 'run.start',
            isPreview
        });
    }

    /**
     * Helper to record run completion
     */
    async runComplete(runId: string, workflowId: string, versionId: string, isPreview = false) {
        await this.record({
            runId,
            workflowId,
            versionId,
            type: 'workflow.complete',
            isPreview
        });
    }
}

export const analytics = new AnalyticsClient();
