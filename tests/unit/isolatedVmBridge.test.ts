
import { describe, it, expect } from 'vitest';

import { helperLibrary } from '../../server/services/scripting/HelperLibrary';
import { executeCodeWithHelpers } from '../../server/utils/enhancedSandboxExecutor';

describe('isolated-vm Bridge Verification', () => {

    it('should execute JS and use simple helpers (string)', async () => {
        const code = `
            const u = helpers.string.upper(input.text);
            return u;
        `;
        const result = await executeCodeWithHelpers({
            language: 'javascript',
            code,
            input: { text: "hello" },
            context: { phase: "test" } as any,
            helpers: helperLibrary,
            timeoutMs: 1000
        });

        // Skip test if isolated-vm is not available (e.g., on Windows)
        if (!result.ok && result.error?.includes("isolated-vm is not available")) {
            console.warn("Skipping test: isolated-vm not available");
            return;
        }

        if (!result.ok) {throw new Error(`TEST FAILURE: ${  result.error}`);}
        expect(result.ok).toBe(true);
        expect(result.output).toBe("HELLO");
    });

    it('should execute JS and use complex helpers (math.sum)', async () => {
        const code = `
            const s = helpers.math.sum(input.nums);
            return s;
        `;
        const result = await executeCodeWithHelpers({
            language: 'javascript',
            code,
            input: { nums: [1, 2, 3] },
            context: { phase: "test" } as any,
            helpers: helperLibrary,
            timeoutMs: 1000
        });

        // Skip test if isolated-vm is not available
        if (!result.ok && result.error?.includes("isolated-vm is not available")) {
            console.warn("Skipping test: isolated-vm not available");
            return;
        }

        if (!result.ok) {
            const fs = await import('fs');
            fs.writeFileSync('test_math_fail.json', JSON.stringify(result, null, 2));
            throw new Error(`TEST FAILURE: ${  result.error}`);
        }
        expect(result.ok).toBe(true);
        expect(result.output).toBe(6);
    });

    it('should execute JS and capture console logs', async () => {
        const code = `
            helpers.console.log("hello log");
            helpers.console.warn("hello warn");
            return "done";
        `;
        // enable console
        const result = await executeCodeWithHelpers({
            language: 'javascript',
            code,
            input: {},
            context: { phase: "test" } as any,
            helpers: undefined, // let it use default with console
            timeoutMs: 1000,
            consoleEnabled: true
        });

        // Skip test if isolated-vm is not available
        if (!result.ok && result.error?.includes("isolated-vm is not available")) {
            console.warn("Skipping test: isolated-vm not available");
            return;
        }

        expect(result.ok).toBe(true);
        expect(result.consoleLogs).toBeDefined();
        // @ts-ignore
        expect(result.consoleLogs[0]).toEqual(["hello log"]);
        // @ts-ignore
        expect(result.consoleLogs[1]).toEqual(["[WARN]", "hello warn"]);
    });

    it('should access context data', async () => {
        const code = `
            return context.workflow.id;
        `;
        const result = await executeCodeWithHelpers({
            language: 'javascript',
            code,
            input: {},
            context: { workflow: { id: "wf-123" } } as any,
            helpers: helperLibrary,
            timeoutMs: 1000
        });

        // Skip test if isolated-vm is not available
        if (!result.ok && result.error?.includes("isolated-vm is not available")) {
            console.warn("Skipping test: isolated-vm not available");
            return;
        }

        expect(result.ok).toBe(true);
        expect(result.output).toBe("wf-123");
    });

    it('should fail on missing helper', async () => {
        const code = `
            return helpers.nonexistent.method();
        `;
        const result = await executeCodeWithHelpers({
            language: 'javascript',
            code,
            input: {},
            context: {} as any,
            helpers: helperLibrary,
            timeoutMs: 1000
        });

        // Skip test if isolated-vm is not available
        if (!result.ok && result.error?.includes("isolated-vm is not available")) {
            console.warn("Skipping test: isolated-vm not available");
            return;
        }

        expect(result.ok).toBe(false);
        // Error message varies - either "Cannot read properties" or "undefined is not a function"
        expect(result.error).toMatch(/Cannot read properties|undefined is not a function/);
    });
});
