
import { useState, useCallback, useEffect, useRef } from "react";

import { useToast } from "@/hooks/use-toast";
import { DevPanelBus } from "@/lib/devpanelBus";
import { useWorkflowVariables } from "@/lib/vault-hooks";

import { JSBlock, JSBlockConfig } from "./types";
import { generateMockInput } from "./utils";

interface UseJSBlockEditorProps {
    block: JSBlock;
    onChange: (updated: JSBlock) => void;
    workflowId?: string;
}

export function useJSBlockEditor({ block, onChange, workflowId }: UseJSBlockEditorProps) {
    const [blockName, setBlockName] = useState(block.config?.name ?? "");
    const [code, setCode] = useState(block.config?.code ?? "");
    const [displayMode, setDisplayMode] = useState<"invisible" | "visible">(
        block.config?.display ?? "invisible"
    );
    const [inputKeys, setInputKeys] = useState<string[]>(block.config?.inputKeys ?? []);
    const [outputKey, setOutputKey] = useState(block.config?.outputKey ?? "computed_value");
    const [timeoutMs, setTimeoutMs] = useState(block.config?.timeoutMs ?? 1000);
    const [error, setError] = useState<string | null>(null);
    const [showPalette, setShowPalette] = useState(false);
    const [testData, setTestData] = useState<Record<string, string>>(block.config?.testData ?? {});
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const { toast } = useToast();
    const { data: variables = [] } = useWorkflowVariables(workflowId ?? "");

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const updateBlockConfig = useCallback((updates: Partial<JSBlockConfig>) => {
        onChange({
            ...block,
            config: {
                ...block.config,
                name: blockName,
                code,
                display: displayMode,
                inputKeys,
                outputKey,
                timeoutMs,
                testData,
                ...updates
            }
        });
    }, [block, blockName, code, displayMode, inputKeys, outputKey, timeoutMs, testData, onChange]);

    const handleInsertVariable = useCallback((key: string) => {
        const textarea = textareaRef.current;
        if (!textarea) { return; }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = code;
        const before = text.substring(0, start);
        const after = text.substring(end);

        const toInsert = `input.${key}`;
        const newCode = before + toInsert + after;

        setCode(newCode);
        updateBlockConfig({ code: newCode });

        setTimeout(() => {
            textarea.focus();
            const newPosition = start + toInsert.length;
            textarea.setSelectionRange(newPosition, newPosition);
        }, 0);

        toast({
            title: "Variable inserted",
            description: `"${key}" inserted at cursor position`,
        });
    }, [code, toast, updateBlockConfig]);

    useEffect(() => {
        const unsubscribe = DevPanelBus.onInsert((key) => {
            const textarea = textareaRef.current;
            if (!textarea || document.activeElement !== textarea) {
                void navigator.clipboard.writeText(key).then(() => {
                    toast({
                        title: "Copied to clipboard",
                        description: `"${key}" copied. No active editor found.`,
                    });
                });
                return;
            }
            handleInsertVariable(key);
        });
        return () => unsubscribe();
    }, [toast, handleInsertVariable]);

    const handleAddInputKey = (key: string) => {
        if (!inputKeys.includes(key)) {
            const newKeys = [...inputKeys, key];
            setInputKeys(newKeys);
            updateBlockConfig({ inputKeys: newKeys });
        }
    };

    const handleRemoveInputKey = (key: string) => {
        const newKeys = inputKeys.filter((k) => k !== key);
        setInputKeys(newKeys);
        updateBlockConfig({ inputKeys: newKeys });
    };

    const validateCode = () => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
            new Function("input", code);
            setError(null);
            toast({
                title: "Syntax Valid",
                description: "JS code parsed successfully.",
            });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            toast({
                title: "Syntax Error",
                description: errorMessage,
                variant: "destructive"
            });
        }
    };

    const runTest = () => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
            const fn = new Function("input", code);
            const mockInput = generateMockInput(inputKeys, testData, variables);
            const result = fn(mockInput) as unknown;

            toast({
                title: "Test Run Complete ✓",
                description: `${JSON.stringify({ input: mockInput, output: result }, null, 2).slice(0, 100)}...`
            });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            toast({
                title: "Execution Error",
                description: errorMessage,
                variant: "destructive"
            });
        }
    };

    return {
        state: {
            blockName, setBlockName,
            code, setCode,
            displayMode, setDisplayMode,
            inputKeys,
            outputKey, setOutputKey,
            timeoutMs, setTimeoutMs,
            error,
            showPalette, setShowPalette,
            testData, setTestData,
            variables
        },
        refs: { textareaRef },
        actions: {
            updateBlockConfig,
            handleInsertVariable,
            handleAddInputKey,
            handleRemoveInputKey,
            validateCode,
            runTest
        }
    };
}
