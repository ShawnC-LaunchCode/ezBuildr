import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { type Mode } from "@/lib/mode";

import { useBlockEditorState, useBlockSave, getTitleForBlock, type UniversalBlock } from "./BlockEditorDialog.hooks";
export type { UniversalBlock };
import { BlockTypeSelector } from "./BlockTypeSelector";
import { RegularBlockForm } from "./forms/RegularBlockForm";
import { TransformBlockForm } from "./forms/TransformBlockForm";

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
    const { creationMode, setCreationMode, formData, setFormData } = useBlockEditorState(block, isOpen);
    const { handleSave } = useBlockSave(workflowId, block, onClose);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {getTitleForBlock(block)}
                    </DialogTitle>
                    <DialogDescription>
                        {creationMode === 'regular' ? "Configure a standard workflow block." : "Configure a custom code transformation."}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    {/* Top Controls: Type Selection (Only if creating new) */}
                    {!block && (
                        <BlockTypeSelector
                            creationMode={creationMode}
                            setCreationMode={setCreationMode}
                            mode={mode}
                        />
                    )}

                    {/* Configuration Form */}
                    {creationMode === 'regular' ? (
                        <RegularBlockForm
                            formData={formData}
                            setFormData={setFormData}
                            mode={mode}
                            block={block}
                            workflowId={workflowId}
                        />
                    ) : (
                        <TransformBlockForm
                            formData={formData}
                            setFormData={setFormData}
                            workflowId={workflowId}
                        />
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => { onClose(); }}>Cancel</Button>
                    <Button onClick={() => { void handleSave(creationMode, formData); }}>Save Block</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
