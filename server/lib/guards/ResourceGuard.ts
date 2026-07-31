export class ResourceGuard {
    // Scripting Limits
    static readonly maxScriptExecutionMs = 500;
    static readonly maxScriptMemoryMb = 128; // Not easily enforceable in Node main thread, but used for sub-processes

    // Workflow Limits
    static readonly maxBlocksPerPage = 100;
    static readonly maxPagesPerWorkflow = 200;

    // Document Limits
    static readonly maxDocSizeBytes = 10 * 1024 * 1024; // 10MB

    /**
     * Check if a generic count exceeds a limit.
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    static checkLimit(name: string, value: number, limit: number) {
        if (value > limit) {
            throw new Error(`Resource Limit Exceeded: ${name} (${value}) exceeds limit of ${limit}`);
        }
    }

    /**
     * Enforce script timeout (for use inside script engine loops or checks)
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    static checkScriptTime(startTime: number) {
        if (Date.now() - startTime > this.maxScriptExecutionMs) {
            throw new Error("Script Execution Timeout");
        }
    }
}
