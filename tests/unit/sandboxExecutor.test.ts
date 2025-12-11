import { describe, it, expect } from "vitest";
import { runJsIsolatedVm } from "../../server/utils/sandboxExecutor";

describe("sandboxExecutor", () => {
    it("should execute JS code correctly", async () => {
        const code = "return input.a + input.b;";
        const input = { a: 1, b: 2 };
        const result = await runJsIsolatedVm(code, input);

        expect(result.ok).toBe(true);
        expect(result.output).toBe(3);
    });

    it("should handle timeouts", async () => {
        const code = "while(true);";
        const result = await runJsIsolatedVm(code, {}, 100);
        expect(result.ok).toBe(false);
        expect(result.error).toContain("TimeoutError");
    });
});
