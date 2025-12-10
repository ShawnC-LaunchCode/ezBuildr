export class ResourceGuard {
    // Scripting Limits
    static readonly MAX_SCRIPT_EXECUTION_MS = 500;
    static readonly MAX_SCRIPT_MEMORY_MB = 128; // Not easily enforceable in Node main thread, but used for sub-processes

    // Workflow Limits
    static readonly MAX_BLOCKS_PER_PAGE = 100;
    static readonly MAX_PAGES_PER_WORKFLOW = 200;

    // Document Limits
    static readonly MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

    /**
     * Check if a generic count exceeds a limit.
     */
    static checkLimit(name: string, value: number, limit: number) {
        if (value > limit) {
            throw new Error(`Resource Limit Exceeded: ${name} (${value}) exceeds limit of ${limit}`);
        }
    }

    /**
     * Enforce script timeout (for use inside script engine loops or checks)
     */
    static checkScriptTime(startTime: number) {
        if (Date.now() - startTime > this.MAX_SCRIPT_EXECUTION_MS) {
            throw new Error("Script Execution Timeout");
        }
    }
}
