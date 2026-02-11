
export interface VaultLogicEmbedOptions {
    workflow: string; // publicSlug
    theme?: Record<string, unknown>;
    container?: HTMLElement | string;
    onComplete?: (result: unknown) => void;
    onError?: (error: unknown) => void;
}

export class VaultLogicEmbed {
    private iframe: HTMLIFrameElement | null = null;
    private options: VaultLogicEmbedOptions;
    private targetOrigin: string;

    constructor(options: VaultLogicEmbedOptions) {
        this.options = options;
        this.targetOrigin = "http://localhost:5000"; // Should be configurable or auto-detected
    }

    mount(container: HTMLElement | string) {
        const target = typeof container === 'string'
            ? document.querySelector(container) as HTMLElement
            : container;

        if (!target) {
            throw new Error("Container not found");
        }

        this.iframe = document.createElement('iframe');
        this.iframe.src = `${this.targetOrigin}/embed/${this.options.workflow}`;
        this.iframe.style.width = "100%";
        this.iframe.style.height = "100%";
        this.iframe.style.border = "none";

        target.appendChild(this.iframe);

        window.addEventListener('message', this.handleMessage.bind(this));
    }

    private handleMessage(event: MessageEvent) {
        // Validate origin in production
        if (event.origin !== this.targetOrigin) {return;}

        const { type, payload } = event.data as { type: string; payload: unknown };

        switch (type) {
            case 'workflow_complete':
                this.options.onComplete?.(payload);
                break;
            case 'workflow_error':
                this.options.onError?.(payload);
                break;
            case 'resize':
                if (this.iframe && typeof payload === 'object' && payload !== null && 'height' in payload) {
                    this.iframe.style.height = `${(payload as { height: number }).height}px`;
                }
                break;
        }
    }

    openModal() {
        // Implementation for modal mode
        console.log("Opening modal for workflow", this.options.workflow);
    }
}

// Global exposure for non-module usage
(window as unknown as Record<string, unknown>).VaultLogic = VaultLogicEmbed;
