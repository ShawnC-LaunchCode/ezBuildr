/**
 * The Code Block authoring surface (CB-8).
 *
 * A split modal: Monaco on the left with the test run beneath it, the block's
 * contract — inputs, outputs, firing policy — in a rail on the right. Code and
 * contract are the same object seen twice, and CB-5 derives one from the other,
 * so they belong on screen together rather than stacked in an inspector column.
 *
 * The modal saves explicitly. CB-5, CB-6 and CB-7 all refuse a save with a
 * specific, author-facing sentence, and each one lands against the control that
 * caused it (AC 7) — including CB-5's dynamic-access warnings, which the engine
 * has always produced and nothing has ever shown anybody until now.
 */
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { JSCodeEditor } from "@/components/blocks/js-editor/JSCodeEditor";
import type { CodeEditorHandle } from "@/components/blocks/js-editor/codeEditorTypes";
import { HelperLibraryDocs } from "@/components/builder/HelperLibraryDocs";
import { EnhancedVariablePicker } from "@/components/common/EnhancedVariablePicker";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
    Dialog, DialogContent, DialogDescription, DialogTitle,
} from "@/components/ui/dialog";
import { usePages } from "@/lib/vault-hooks";

import { FiringPanel, InputsPanel, OutputsPanel, PanelMessageSlot } from "./CodeBlockPanels";
import { CodeBlockTestPanel } from "./CodeBlockTestPanel";
import { classifyWarning, collectByField, type CodeBlockField } from "./saveErrors";
import type { JSQuestionConfig } from "./types";
import { useCodeBlockDraft } from "./useCodeBlockDraft";

interface CodeBlockEditorModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    stepId: string;
    pageId?: string;
    workflowId?: string;
    title: string;
    config: JSQuestionConfig;
}

export function CodeBlockEditorModal({
    open, onOpenChange, stepId, pageId, workflowId, title, config,
}: CodeBlockEditorModalProps): JSX.Element {
    const {
        draft, warnings, saveError, derivedInputKeys, derivedOutputKeys,
        isSaving, isChecking, isDirty, update, save,
        runTest,
    } = useCodeBlockDraft({ stepId, pageId, config, open });
    const { data: pages = [] } = usePages(workflowId);
    const [showLeaveWarning, setShowLeaveWarning] = useState(false);
    const [showVariables, setShowVariables] = useState(false);
    const editorRef = useRef<CodeEditorHandle | null>(null);

    const handleEditorReady = useCallback((handle: CodeEditorHandle) => {
        editorRef.current = handle;
    }, []);

    const warningsByField = useMemo(
        () => collectByField(warnings, classifyWarning),
        [warnings]
    );
    const errorFor = (field: CodeBlockField): string | undefined =>
        saveError?.field === field ? saveError.message : undefined;
    const messagesFor = (field: CodeBlockField) => ({
        error: errorFor(field),
        warnings: warningsByField[field],
    });

    // The card behind the modal re-reads the step from the query cache, which
    // `useUpdateStep` invalidates — so the saved config propagates without this
    // modal also handing it back up and triggering a second, identical PUT.
    const handleSave = async (): Promise<void> => {
        if (await save()) { onOpenChange(false); }
    };

    const requestClose = (next: boolean): void => {
        if (next) { onOpenChange(true); return; }
        if (isDirty && !showLeaveWarning) { setShowLeaveWarning(true); return; }
        setShowLeaveWarning(false);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={requestClose}>
            <DialogContent className="flex h-[88vh] max-h-[900px] w-[min(1180px,95vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
                <header className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                            Code Block
                        </p>
                        <DialogTitle className="truncate text-base font-semibold">{title}</DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Runs sandboxed JavaScript. Call <code className="font-mono">emit</code> once with your declared outputs.
                        </DialogDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pr-8">
                        {isChecking && !isSaving && (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                Checking
                            </span>
                        )}
                        <Button type="button" variant="ghost" size="sm" onClick={() => { requestClose(false); }}>
                            {showLeaveWarning ? 'Discard changes' : 'Close'}
                        </Button>
                        <Button type="button" size="sm" disabled={isSaving} onClick={() => { void handleSave(); }}>
                            {isSaving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden="true" />}
                            Save
                        </Button>
                    </div>
                </header>

                <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_356px]">
                    <div className="flex min-h-0 flex-col gap-3 overflow-hidden bg-background p-5 lg:border-r">
                        <div className="flex items-baseline justify-between gap-2">
                            <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                                JavaScript
                            </h3>
                            <p className="truncate text-[11px] text-muted-foreground/80">
                                <code className="font-mono">input</code> holds your declared inputs ·{' '}
                                <code className="font-mono">helpers</code> is available
                            </p>
                        </div>
                        <div className="min-h-0 flex-1">
                            <JSCodeEditor
                                code={draft.code}
                                ariaLabel="Code Block JavaScript"
                                onReady={handleEditorReady}
                                onChange={(code) => { update({ code }); }}
                            />
                        </div>
                        <PanelMessageSlot messages={messagesFor('code')} />
                        <div className="h-[210px] shrink-0 border-t pt-3">
                            <CodeBlockTestPanel inputs={draft.inputs} onRun={runTest} />
                        </div>
                    </div>

                    <aside className="min-h-0 space-y-5 overflow-y-auto bg-muted/40 p-5 pr-4">
                        <InputsPanel
                            inputs={draft.inputs}
                            derivedKeys={derivedInputKeys}
                            messages={messagesFor('inputs')}
                            onChange={(inputs) => { update({ inputs }); }}
                        />
                        <OutputsPanel
                            outputs={draft.outputs}
                            derivedKeys={derivedOutputKeys}
                            messages={messagesFor('outputs')}
                            onChange={(outputs) => { update({ outputs }); }}
                        />
                        <FiringPanel
                            config={draft}
                            pages={pages}
                            messages={messagesFor('trigger')}
                            repeatMessages={messagesFor('repeat')}
                            onChange={update}
                        />

                        {workflowId !== undefined && workflowId !== '' && (
                            <Collapsible open={showVariables} onOpenChange={setShowVariables}>
                                <CollapsibleTrigger asChild>
                                    <Button variant="outline" size="sm" className="w-full justify-between text-xs">
                                        <span>Available variables</span>
                                        {showVariables
                                            ? <ChevronUp className="h-3 w-3" aria-hidden="true" />
                                            : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="mt-2">
                                    <div className="max-h-64 overflow-hidden rounded-md border bg-card">
                                        <EnhancedVariablePicker
                                            workflowId={workflowId}
                                            showListProperties={true}
                                            onInsert={(path) => { editorRef.current?.insertAtCursor(`input.${path}`); }}
                                        />
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        )}

                        <HelperLibraryDocs />
                    </aside>
                </div>

                {(saveError?.field === 'general' || showLeaveWarning) && (
                    <footer className="shrink-0 border-t px-5 py-3">
                        {saveError?.field === 'general' && (
                            <p role="alert" className="text-xs text-destructive">{saveError.message}</p>
                        )}
                        {showLeaveWarning && (
                            <p role="status" className="text-xs text-muted-foreground">
                                You have unsaved changes. Press <strong>Discard changes</strong> to leave them behind, or <strong>Save</strong>.
                            </p>
                        )}
                    </footer>
                )}
            </DialogContent>
        </Dialog>
    );
}
