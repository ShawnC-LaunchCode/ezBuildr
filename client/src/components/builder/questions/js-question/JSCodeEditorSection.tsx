/**
 * The Code Block's face inside the step card.
 *
 * Authoring moved into `CodeBlockEditorModal` (CB-8): a step card is 320px of
 * a scrolling canvas, which is enough room to *state* a block's contract and
 * nowhere near enough to write one in. So this is a summary — what it reads,
 * what it writes, when it fires — plus the door.
 *
 * The textarea that used to live here is gone rather than hidden. Two editors
 * over one config is how a draft gets silently overwritten by a stale copy.
 */
import { Code2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { CodeBlockEditorModal } from "./CodeBlockEditorModal";
import type { JSQuestionConfig } from "./types";

const TRIGGER_LABELS: Record<string, string> = {
    everySubmit: 'every submit',
    atPage: 'from a page onward',
    runStart: 'run start',
    runComplete: 'run complete',
};

const REPEAT_LABELS: Record<string, string> = {
    onChange: 'on change',
    once: 'once',
    always: 'always',
};

interface JSCodeEditorSectionProps {
    config: JSQuestionConfig;
    elementId: string;
    pageId?: string;
    workflowId?: string;
    title?: string;
}

function KeyList({ label, keys, empty }: { label: string; keys: string[]; empty: string }): JSX.Element {
    return (
        <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{label}</p>
            {keys.length === 0 ? (
                <p className="text-xs text-muted-foreground">{empty}</p>
            ) : (
                <div className="flex flex-wrap gap-1">
                    {keys.map(key => (
                        <Badge key={key} variant="secondary" className="font-mono text-[11px] font-normal">{key}</Badge>
                    ))}
                </div>
            )}
        </div>
    );
}

export function JSCodeEditorSection({
    config, elementId, pageId, workflowId, title = 'Code Block',
}: JSCodeEditorSectionProps): JSX.Element {
    const [open, setOpen] = useState(false);
    const lineCount = config.code === '' ? 0 : config.code.split('\n').length;
    const trigger = TRIGGER_LABELS[config.trigger ?? 'everySubmit'] ?? 'every submit';
    const repeat = REPEAT_LABELS[config.repeat ?? 'onChange'] ?? 'on change';

    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
                <KeyList
                    label="Reads"
                    keys={config.inputs.map(input => input.key).filter(key => key !== '')}
                    empty="Nothing yet."
                />
                <KeyList
                    label="Writes"
                    keys={config.outputs.map(output => output.key).filter(key => key !== '')}
                    empty="Nothing yet."
                />
            </div>

            <p className="text-xs text-muted-foreground">
                Fires <span className="text-foreground">{trigger}</span>, repeating{' '}
                <span className="text-foreground">{repeat}</span> ·{' '}
                <span className="tabular-nums">{lineCount}</span> {lineCount === 1 ? 'line' : 'lines'} of JavaScript
            </p>

            <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                id={`frame-js-open-${elementId}`}
                onClick={() => { setOpen(true); }}
            >
                <Code2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Open code editor
            </Button>

            <CodeBlockEditorModal
                open={open}
                onOpenChange={setOpen}
                stepId={elementId}
                pageId={pageId}
                workflowId={workflowId}
                title={title}
                config={config}
            />
        </div>
    );
}
