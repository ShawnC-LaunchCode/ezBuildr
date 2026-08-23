import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { TransformBlockLanguage, ApiTransformBlock } from "@/lib/vault-api";
import { useCreateTransformBlock, useUpdateTransformBlock } from "@/lib/vault-hooks";

import { TransformBlockForm } from "./TransformBlockForm";
import { TransformBlockTester } from "./TransformBlockTester";

interface TransformBlockEditorDialogProps {
    workflowId: string;
    block: ApiTransformBlock | null;
    isOpen: boolean;
    onClose: () => void;
}

export function TransformBlockEditorDialog({
    workflowId,
    block,
    isOpen,
    onClose,
}: TransformBlockEditorDialogProps) {
    const createMutation = useCreateTransformBlock();
    const updateMutation = useUpdateTransformBlock();

    const { toast } = useToast();

    const [formData, setFormData] = useState({
        name: block?.name ?? "",
        language: block?.language ?? ("javascript" as TransformBlockLanguage),
        phase: block?.phase ?? "onPageSubmit",
        code: block?.code ?? "",
        inputKeys: block?.inputKeys ?? [],
        outputKey: block?.outputKey ?? "",
        timeoutMs: block?.timeoutMs ?? 1000,
        enabled: block?.enabled ?? true,
        order: block?.order ?? 0,
    });

    const [inputKeysText, setInputKeysText] = useState(block?.inputKeys?.join(", ") ?? "");

    // Reset form data when dialog opens or block changes
    useEffect(() => {
        if (isOpen) {
            setFormData({
                name: block?.name ?? "",
                language: block?.language ?? "javascript",
                phase: block?.phase ?? "onPageSubmit",
                code: block?.code ?? "",
                inputKeys: block?.inputKeys ?? [],
                outputKey: block?.outputKey ?? "",
                timeoutMs: block?.timeoutMs ?? 1000,
                enabled: block?.enabled ?? true,
                order: block?.order ?? 0,
            });
            setInputKeysText(block?.inputKeys?.join(", ") ?? "");
        }
    }, [isOpen, block]);

    const handleSave = async () => {
        try {
            // Parse input keys from comma-separated string
            const inputKeys = inputKeysText
                .split(",")
                .map((k: string) => k.trim())
                .filter((k: string) => k.length > 0);

            const data = {
                ...formData,
                inputKeys,
            };

            if (block) {
                await updateMutation.mutateAsync({ id: block.id, workflowId, ...data });
                toast({ title: "Success", description: "Transform block updated" });
            } else {
                await createMutation.mutateAsync({ workflowId, ...data });
                toast({ title: "Success", description: "Transform block created" });
            }
            onClose();
        } catch (error) {
            toast({ title: "Error", description: "Failed to save block", variant: "destructive" });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{block ? "Edit Transform Block" : "Create Transform Block"}</DialogTitle>
                    <DialogDescription>Write JavaScript or Python code to transform workflow data</DialogDescription>
                </DialogHeader>

                <TransformBlockForm
                    formData={formData}
                    onChange={setFormData}
                    inputKeysText={inputKeysText}
                    onInputKeysChange={setInputKeysText}
                />

                {block && <TransformBlockTester block={block} />}

                <DialogFooter>
                    <Button variant="outline" onClick={() => { onClose(); }}>
                        Cancel
                    </Button>
                    <Button onClick={() => { void handleSave(); }} disabled={createMutation.isPending || updateMutation.isPending}>
                        {block ? "Update" : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
