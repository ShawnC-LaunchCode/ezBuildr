import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { type Mode } from "@/lib/mode";

import { useBlockEditorState, useBlockSave, getTitleForBlock, type UniversalBlock } from "./BlockEditorDialog.hooks";
export type { UniversalBlock };
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
                        <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border">
                            <Label>Block Category:</Label>
                            <div className="flex gap-2">
                                <Button
                                    variant={creationMode === 'regular' ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => { setCreationMode('regular'); }}
                                >
                                    Standard Block
                                </Button>
                                <Button
                                    variant={creationMode === 'transform' ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => { setCreationMode('transform'); }}
                                    disabled={mode === 'easy'}
                                >
                                    Code Transform
                                </Button>
                            </div>
                            {mode === 'easy' && creationMode === 'regular' && (
                                <span className="text-xs text-muted-foreground ml-2">Code transforms are an Advanced Mode feature.</span>
                            )}
                        </div>
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
