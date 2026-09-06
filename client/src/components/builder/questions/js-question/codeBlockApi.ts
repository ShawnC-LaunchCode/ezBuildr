/**
 * Client for `POST /api/steps/:stepId/code-block/test` (CB-8).
 *
 * Two modes, one endpoint. With `testData` the server runs the real
 * `ScriptEngine` in the real sandbox and returns what the block emitted;
 * without it, the same AST pass runs but nothing executes — which is how the
 * editor collects CB-5's derived keys and dynamic-access warnings on open and
 * on save without paying for a sandbox run each time.
 */
import { fetchAPI } from "@/lib/vault-api";

export interface CodeBlockTestResponse {
    success: boolean;
    executed: boolean;
    output?: unknown;
    error?: string;
    warnings: string[];
    derivedInputs: string[];
    derivedOutputs: string[];
    consoleLogs?: unknown[][];
    durationMs?: number;
}

export function testCodeBlock(
    stepId: string,
    body: { code?: string; testData?: Record<string, unknown> }
): Promise<CodeBlockTestResponse> {
    return fetchAPI<CodeBlockTestResponse>(`/api/steps/${stepId}/code-block/test`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}
