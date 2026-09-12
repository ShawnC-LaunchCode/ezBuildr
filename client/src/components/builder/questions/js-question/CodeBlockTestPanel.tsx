/**
 * "Run this against sample data and show me what it emits."
 *
 * The panel POSTs to `POST /api/steps/:stepId/code-block/test`, which executes
 * the code in the SAME `isolated-vm` sandbox the run engine uses — same AST
 * validation, same helper library, same timeout. A client-side `new Function`
 * preview would agree with the server right up until it mattered.
 *
 * Sample values are seeded per input key. Anything that parses as JSON is sent
 * as JSON; everything else is sent as the literal string, so an author can type
 * `Ada` without quoting it and `{"a":1}` when they mean an object.
 */
import { Loader2, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CodeBlockTestResponse } from "./codeBlockApi";
import type { CodeBlockInput } from "./types";

function parseSample(raw: string): unknown {
    if (raw.trim() === '') { return null; }
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return raw;
    }
}

export function CodeBlockTestPanel({
    inputs, onRun,
}: {
    inputs: CodeBlockInput[];
    onRun: (testData: Record<string, unknown>) => Promise<CodeBlockTestResponse>;
}): JSX.Element {
    const [samples, setSamples] = useState<Record<string, string>>({});
    const [result, setResult] = useState<CodeBlockTestResponse | null>(null);
    const [transportError, setTransportError] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    const run = async (): Promise<void> => {
        setIsRunning(true);
        setTransportError(null);
        try {
            const testData = Object.fromEntries(
                inputs.filter(input => input.key !== '')
                    .map(input => [input.key, parseSample(samples[input.key] ?? '')])
            );
            setResult(await onRun(testData));
        } catch (error) {
            setResult(null);
            setTransportError(error instanceof Error ? error.message : 'The test request failed.');
        } finally {
            setIsRunning(false);
        }
    };

    const namedInputs = inputs.filter(input => input.key !== '');

    return (
        <div className="flex h-full flex-col gap-3 overflow-hidden">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                    Test run
                </h3>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2.5 text-xs"
                    disabled={isRunning}
                    onClick={() => { void run(); }}
                >
                    {isRunning
                        ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                        : <Play className="mr-1 h-3 w-3" aria-hidden="true" />}
                    Run
                </Button>
            </div>

            <div className="grid min-h-0 flex-1 gap-3 overflow-hidden md:grid-cols-2">
                <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
                    {namedInputs.length === 0 ? (
                        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-xs text-muted-foreground">
                            No inputs declared. Run it anyway to see what the block emits.
                        </p>
                    ) : namedInputs.map(input => (
                        <div key={input.key} className="space-y-1">
                            <Label htmlFor={`cb-sample-${input.key}`} className="font-mono text-[11px] text-muted-foreground">
                                {input.key}
                            </Label>
                            <Input
                                id={`cb-sample-${input.key}`}
                                aria-label={`Sample value for ${input.key}`}
                                value={samples[input.key] ?? ''}
                                placeholder="Sample value"
                                onChange={(event) => {
                                    setSamples(current => ({ ...current, [input.key]: event.target.value }));
                                }}
                                className="h-7 font-mono text-xs"
                            />
                        </div>
                    ))}
                </div>

                <output className="min-h-0 overflow-auto rounded-md border bg-muted/30 p-2.5 font-mono text-[11px] leading-relaxed">
                    {transportError !== null && <span className="text-destructive">{transportError}</span>}
                    {transportError === null && result === null && (
                        <span className="text-muted-foreground">Emitted output appears here.</span>
                    )}
                    {result !== null && result.success && (
                        <>
                            <pre className="whitespace-pre-wrap break-words text-foreground">
                                {JSON.stringify(result.output ?? null, null, 2)}
                            </pre>
                            {result.durationMs !== undefined && (
                                <p className="mt-2 text-muted-foreground tabular-nums">{result.durationMs} ms</p>
                            )}
                        </>
                    )}
                    {result !== null && !result.success && (
                        <span className="whitespace-pre-wrap break-words text-destructive">
                            {result.error ?? 'The block failed.'}
                        </span>
                    )}
                </output>
            </div>
        </div>
    );
}
