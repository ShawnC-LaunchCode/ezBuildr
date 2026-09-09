import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { type Mode } from "@/lib/mode";

import { useBlockEditorState, useBlockSave, getTitleForBlock, type UniversalBlock } from "./BlockEditorDialog.hooks";
export type { UniversalBlock };
import { RegularBlockForm } from "./forms/RegularBlockForm";

export function BlockEditorDialog({
    workflowId,
    block,
    mode,
    isOpen,
    onClose,
}: {
    workflowId: string;
    block: UniversalBlock | null;
    mode: Mode;
    isOpen: boolean;
    onClose: () => void;
}) {
    const { formData, setFormData } = useBlockEditorState(block, isOpen);
    const { handleSave } = useBlockSave(workflowId, block, onClose);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {getTitleForBlock(block)}
                    </DialogTitle>
                    <DialogDescription>
                        Configure a standard workflow block.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    <RegularBlockForm
                        formData={formData}
                        setFormData={setFormData}
                        mode={mode}
                        block={block}
                        workflowId={workflowId}
                    />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => { onClose(); }}>Cancel</Button>
                    <Button onClick={() => { void handleSave(formData); }}>Save Block</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
