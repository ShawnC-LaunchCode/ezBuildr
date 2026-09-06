/**
 * Draft state for the Code Block editor modal (CB-8).
 *
 * The modal edits a COPY and saves explicitly. The card behind it saves on
 * every keystroke, which is right for a title field and wrong here: CB-5, CB-6
 * and CB-7 all reject a save with a specific message, and there is nowhere to
 * put that message if the save is a fire-and-forget mutation nobody awaited.
 * So this hook owns `mutateAsync`, catches the 400, and hands the modal the
 * message plus the field it belongs against.
 */
import { useCallback, useEffect, useState } from "react";

import { useUpdateStep } from "@/lib/vault-hooks";

import type { CodeBlockInput, CodeBlockOutput, JSQuestionConfig } from "./types";
import { testCodeBlock, type CodeBlockTestResponse } from "./codeBlockApi";
import { classifySaveError, type CodeBlockField } from "./saveErrors";

export interface CodeBlockDraftState {
    draft: JSQuestionConfig;
    /** Keys the AST pass proved, as opposed to keys the author typed. */
    derivedInputKeys: string[];
    derivedOutputKeys: string[];
    warnings: string[];
    saveError: { field: CodeBlockField; message: string } | null;
    isSaving: boolean;
    isChecking: boolean;
    isDirty: boolean;
}

export interface CodeBlockDraftApi extends CodeBlockDraftState {
    update: (updates: Partial<JSQuestionConfig>) => void;
    save: () => Promise<boolean>;
    runTest: (testData: Record<string, unknown>) => Promise<CodeBlockTestResponse>;
    reset: () => void;
}

/** Author declarations win; derivation only ADDS keys it can prove (Decisions 1). */
function mergeDerived(config: JSQuestionConfig, response: CodeBlockTestResponse): JSQuestionConfig {
    const inputs: CodeBlockInput[] = [...config.inputs];
    for (const key of response.derivedInputs) {
        if (!inputs.some(input => input.key === key)) { inputs.push({ key, required: true }); }
    }
    const outputs: CodeBlockOutput[] = [...config.outputs];
    for (const key of response.derivedOutputs) {
        if (!outputs.some(output => output.key === key)) { outputs.push({ key, type: 'object' }); }
    }
    return { ...config, inputs, outputs };
}

function messageOf(error: unknown): string {
    return error instanceof Error && error.message !== ''
        ? error.message
        : 'Failed to save the Code Block.';
}

export function useCodeBlockDraft(params: {
    stepId: string;
    pageId: string | undefined;
    config: JSQuestionConfig;
    open: boolean;
}): CodeBlockDraftApi {
    const { stepId, pageId, config, open } = params;
    const updateStep = useUpdateStep();

    const [draft, setDraft] = useState<JSQuestionConfig>(config);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [derivedInputKeys, setDerivedInputKeys] = useState<string[]>([]);
    const [derivedOutputKeys, setDerivedOutputKeys] = useState<string[]>([]);
    const [saveError, setSaveError] = useState<{ field: CodeBlockField; message: string } | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const reset = useCallback(() => {
        setDraft(config);
        setWarnings([]);
        setSaveError(null);
        setIsDirty(false);
    }, [config]);

    const absorb = useCallback((response: CodeBlockTestResponse) => {
        setWarnings(response.warnings);
        setDerivedInputKeys(response.derivedInputs);
        setDerivedOutputKeys(response.derivedOutputs);
        setDraft(current => mergeDerived(current, response));
    }, []);

    // Opening is the one moment the modal is guaranteed to be showing the saved
    // truth, so it is also where the derived keys and warnings are refreshed.
    useEffect(() => {
        if (!open) { return; }
        let cancelled = false;
        setDraft(config);
        setSaveError(null);
        setIsDirty(false);
        setIsChecking(true);
        testCodeBlock(stepId, { code: config.code })
            .then((response) => { if (!cancelled) { absorb(response); } })
            .catch(() => { if (!cancelled) { setWarnings([]); } })
            .finally(() => { if (!cancelled) { setIsChecking(false); } });
        return () => { cancelled = true; };
        // `config` is intentionally read once per open, and so is NOT a dependency:
        // re-syncing mid-edit would throw away the author's unsaved draft every
        // time the card behind the modal refetches the step.
    }, [open, stepId, absorb]);

    const update = useCallback((updates: Partial<JSQuestionConfig>) => {
        setDraft(current => ({ ...current, ...updates }));
        setIsDirty(true);
        setSaveError(null);
    }, []);

    const save = useCallback(async (): Promise<boolean> => {
        if (pageId === undefined) {
            setSaveError({ field: 'general', message: 'Cannot save: this Code Block has no page.' });
            return false;
        }
        setSaveError(null);
        setIsChecking(true);
        try {
            // Warnings first, so they are on screen whether the save lands or not.
            const checked = await testCodeBlock(stepId, { code: draft.code }).catch(() => null);
            if (checked) {
                setWarnings(checked.warnings);
                setDerivedInputKeys(checked.derivedInputs);
                setDerivedOutputKeys(checked.derivedOutputs);
            }
            const saved = await updateStep.mutateAsync({ id: stepId, pageId, config: draft });
            const savedConfig = saved.config as JSQuestionConfig | undefined;
            // The server DERIVES inputs and outputs during validateForSave, so the
            // response — not the draft — is the authority on what was stored.
            if (savedConfig) { setDraft(savedConfig); }
            setIsDirty(false);
            return true;
        } catch (error) {
            const message = messageOf(error);
            setSaveError({ field: classifySaveError(message), message });
            return false;
        } finally {
            setIsChecking(false);
        }
    }, [draft, pageId, stepId, updateStep]);

    const runTest = useCallback(async (testData: Record<string, unknown>) => {
        const response = await testCodeBlock(stepId, { code: draft.code, testData });
        absorb(response);
        return response;
    }, [absorb, draft.code, stepId]);

    return {
        draft, warnings, saveError, isChecking, isDirty,
        derivedInputKeys, derivedOutputKeys,
        isSaving: updateStep.isPending,
        update, save, runTest, reset,
    };
}
