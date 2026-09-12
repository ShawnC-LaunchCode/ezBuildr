/**
 * The right-hand rail of the Code Block editor: the block's contract.
 *
 * Inputs, outputs and firing policy sit beside the code rather than under it,
 * because they are derived FROM the code (CB-5) and an author needs to see both
 * halves move together. Each panel owns the inline slot where its save error or
 * dynamic-access warning lands (CB-8 AC 7) — a message next to the control that
 * caused it, not a toast that vanishes.
 */
import { AlertTriangle, CircleAlert, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import type { CodeBlockRepeat, CodeBlockTrigger } from "@shared/types/steps";

import type { CodeBlockInput, CodeBlockOutput, JSQuestionConfig } from "./types";

const OUTPUT_TYPES: CodeBlockOutput['type'][] = ['string', 'number', 'boolean', 'date', 'object', 'list'];

const TRIGGERS: ReadonlyArray<{ value: CodeBlockTrigger; label: string; hint: string }> = [
    { value: 'everySubmit', label: 'Every submit', hint: 'Considered at every page submit and navigation.' },
    { value: 'atPage', label: 'From a page onward', hint: 'A floor: never before that page, every evaluation after.' },
    { value: 'runStart', label: 'Run start', hint: 'Once at run creation, against inbound data.' },
    { value: 'runComplete', label: 'Run complete', hint: 'In the completion pass, before documents generate.' },
];

const REPEATS: ReadonlyArray<{ value: CodeBlockRepeat; label: string; hint: string }> = [
    { value: 'onChange', label: 'On change', hint: 'Re-runs when the inputs actually move.' },
    { value: 'once', label: 'Once', hint: 'Fires the first time it is ready, then freezes.' },
    { value: 'always', label: 'Always', hint: 'Runs at every eligible evaluation.' },
];

export interface PanelMessages {
    error?: string;
    warnings?: string[];
}

const ROW = "rounded-md border bg-card px-2.5 py-2 transition-colors hover:border-foreground/20";

export function PanelMessageSlot({ messages }: { messages?: PanelMessages }): JSX.Element | null {
    const warnings = messages?.warnings ?? [];
    if (messages?.error === undefined && warnings.length === 0) { return null; }
    return (
        <div className="space-y-1.5">
            {messages?.error !== undefined && (
                <p role="alert" className="flex gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs leading-relaxed text-destructive">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{messages.error}</span>
                </p>
            )}
            {warnings.map(warning => (
                <p key={warning} role="status" className="flex gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{warning}</span>
                </p>
            ))}
        </div>
    );
}

/** Shared rail chrome: mono eyebrow, hairline body, inline message slot. */
export function RailPanel({
    title, count, action, messages, children,
}: {
    title: string;
    count?: number;
    action?: JSX.Element;
    messages?: PanelMessages;
    children: React.ReactNode;
}): JSX.Element {
    return (
        <section aria-label={title} className="space-y-2">
            <header className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                    {title}
                    {count !== undefined && (
                        <span className="tabular-nums text-muted-foreground/70">{count}</span>
                    )}
                </h3>
                {action}
            </header>
            <PanelMessageSlot messages={messages} />
            {children}
        </section>
    );
}

function DerivedBadge(): JSX.Element {
    return (
        <Badge variant="outline" className="h-5 shrink-0 border-primary/40 px-1.5 text-[10px] font-medium uppercase tracking-wider text-primary">
            derived
        </Badge>
    );
}

function EmptyRail({ children }: { children: React.ReactNode }): JSX.Element {
    return (
        <p className={cn(
            "rounded-md border border-dashed bg-muted/30 px-3 py-4 text-xs leading-relaxed text-muted-foreground"
        )}>
            {children}
        </p>
    );
}

export function InputsPanel({
    inputs, derivedKeys, messages, onChange,
}: {
    inputs: CodeBlockInput[];
    derivedKeys: string[];
    messages?: PanelMessages;
    onChange: (inputs: CodeBlockInput[]) => void;
}): JSX.Element {
    const replace = (index: number, next: CodeBlockInput): void => {
        onChange(inputs.map((item, i) => (i === index ? next : item)));
    };

    return (
        <RailPanel
            title="Inputs"
            count={inputs.length}
            messages={messages}
            action={
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
                    onClick={() => { onChange([...inputs, { key: '', required: true }]); }}>
                    <Plus className="mr-1 h-3 w-3" aria-hidden="true" /> Add
                </Button>
            }
        >
            {inputs.length === 0 ? (
                <EmptyRail>
                    No inputs yet. Read one with <code className="font-mono">input.name</code> and it appears here on save.
                </EmptyRail>
            ) : (
                <ul className="space-y-1.5">
                    {inputs.map((input, index) => (
                        <li key={index} className={ROW}>
                            <div className="flex items-center gap-2">
                                <Input
                                    aria-label={`Input key ${index + 1}`}
                                    value={input.key}
                                    placeholder="input_key"
                                    onChange={(event) => { replace(index, { ...input, key: event.target.value }); }}
                                    className="h-7 flex-1 border-0 bg-transparent px-0 font-mono text-[13px] shadow-none focus-visible:ring-0"
                                />
                                {derivedKeys.includes(input.key) && <DerivedBadge />}
                                <Button type="button" variant="ghost" size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    aria-label={`Remove input ${input.key}`}
                                    onClick={() => { onChange(inputs.filter((_, i) => i !== index)); }}>
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                                <Switch
                                    id={`cb-input-required-${index}`}
                                    checked={input.required}
                                    aria-label={`Required: ${input.key}`}
                                    onCheckedChange={(checked) => { replace(index, { ...input, required: checked }); }}
                                />
                                <Label htmlFor={`cb-input-required-${index}`} className="cursor-pointer text-xs text-muted-foreground">
                                    {input.required ? 'Required — gates the run' : 'Optional — passes through as null'}
                                </Label>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </RailPanel>
    );
}

export function OutputsPanel({
    outputs, derivedKeys, messages, onChange,
}: {
    outputs: CodeBlockOutput[];
    derivedKeys: string[];
    messages?: PanelMessages;
    onChange: (outputs: CodeBlockOutput[]) => void;
}): JSX.Element {
    const replace = (index: number, next: CodeBlockOutput): void => {
        onChange(outputs.map((item, i) => (i === index ? next : item)));
    };

    return (
        <RailPanel
            title="Outputs"
            count={outputs.length}
            messages={messages}
            action={
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
                    onClick={() => { onChange([...outputs, { key: '', type: 'object' }]); }}>
                    <Plus className="mr-1 h-3 w-3" aria-hidden="true" /> Add
                </Button>
            }
        >
            {outputs.length === 0 ? (
                <EmptyRail>
                    No outputs yet. Call <code className="font-mono">emit</code> with an object and its keys appear here on save.
                </EmptyRail>
            ) : (
                <ul className="space-y-1.5">
                    {outputs.map((output, index) => (
                        <li key={index} className={ROW}>
                            <div className="flex items-center gap-2">
                                <Input
                                    aria-label={`Output key ${index + 1}`}
                                    value={output.key}
                                    placeholder="output_key"
                                    onChange={(event) => { replace(index, { ...output, key: event.target.value }); }}
                                    className="h-7 flex-1 border-0 bg-transparent px-0 font-mono text-[13px] shadow-none focus-visible:ring-0"
                                />
                                {derivedKeys.includes(output.key) && <DerivedBadge />}
                                <Button type="button" variant="ghost" size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    aria-label={`Remove output ${output.key}`}
                                    onClick={() => { onChange(outputs.filter((_, i) => i !== index)); }}>
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                            </div>
                            <div className="mt-1.5">
                                <Select value={output.type}
                                    onValueChange={(type: CodeBlockOutput['type']) => { replace(index, { ...output, type }); }}>
                                    <SelectTrigger aria-label={`Type: ${output.key}`} className="h-7 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {OUTPUT_TYPES.map(type => (
                                            <SelectItem key={type} value={type} className="font-mono text-xs">{type}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </RailPanel>
    );
}

export function FiringPanel({
    config, pages, messages, repeatMessages, onChange,
}: {
    config: JSQuestionConfig;
    pages: ReadonlyArray<{ id: string; title: string }>;
    messages?: PanelMessages;
    repeatMessages?: PanelMessages;
    onChange: (updates: Partial<JSQuestionConfig>) => void;
}): JSX.Element {
    const trigger = config.trigger ?? 'everySubmit';
    const repeat = config.repeat ?? 'onChange';
    const triggerHint = TRIGGERS.find(item => item.value === trigger)?.hint ?? '';
    const repeatHint = REPEATS.find(item => item.value === repeat)?.hint ?? '';

    return (
        <RailPanel title="Firing" messages={messages}>
            <div className="space-y-3 rounded-md border bg-card p-3">
                <div className="space-y-1.5">
                    <Label htmlFor="cb-trigger" className="text-xs">Trigger</Label>
                    <Select
                        value={trigger}
                        onValueChange={(value: CodeBlockTrigger) => {
                            // `triggerPageId` is rejected by the server for every other
                            // trigger, so leaving a stale one behind makes the next save
                            // fail with an error the author never caused.
                            onChange(value === 'atPage'
                                ? { trigger: value }
                                : { trigger: value, triggerPageId: undefined });
                        }}
                    >
                        <SelectTrigger id="cb-trigger" aria-label="Trigger" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {TRIGGERS.map(item => (
                                <SelectItem key={item.value} value={item.value} className="text-xs">{item.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{triggerHint}</p>
                </div>

                {trigger === 'atPage' && (
                    <div className="space-y-1.5">
                        <Label htmlFor="cb-trigger-page" className="text-xs">
                            Page <span className="text-destructive" aria-hidden="true">*</span>
                        </Label>
                        <Select
                            value={config.triggerPageId ?? ''}
                            onValueChange={(triggerPageId) => { onChange({ triggerPageId }); }}
                        >
                            <SelectTrigger id="cb-trigger-page" aria-label="Trigger page" className="h-8 text-xs">
                                <SelectValue placeholder="Choose a page" />
                            </SelectTrigger>
                            <SelectContent>
                                {pages.map(page => (
                                    <SelectItem key={page.id} value={page.id} className="text-xs">{page.title}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div className="space-y-1.5">
                    <Label htmlFor="cb-repeat" className="text-xs">Repeat</Label>
                    <Select value={repeat} onValueChange={(value: CodeBlockRepeat) => { onChange({ repeat: value }); }}>
                        <SelectTrigger id="cb-repeat" aria-label="Repeat" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {REPEATS.map(item => (
                                <SelectItem key={item.value} value={item.value} className="text-xs">{item.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{repeatHint}</p>
                    <PanelMessageSlot messages={repeatMessages} />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="cb-timeout" className="text-xs">Timeout (ms)</Label>
                    <Input
                        id="cb-timeout"
                        type="number"
                        min={100}
                        max={30000}
                        value={config.timeoutMs ?? 1000}
                        onChange={(event) => { onChange({ timeoutMs: Number(event.target.value) || 1000 }); }}
                        className="h-8 text-xs tabular-nums"
                    />
                </div>
            </div>
        </RailPanel>
    );
}
