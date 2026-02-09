import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ListToolsDialogsProps {
    showReplaceConfirm: boolean;
    setShowReplaceConfirm: (show: boolean) => void;
    replaceMode: "migrate" | "reset";
    setReplaceMode: (mode: "migrate" | "reset") => void;
    confirmReplaceListTools: () => void;

    showUnlinkConfirm: boolean;
    setShowUnlinkConfirm: (show: boolean) => void;
    unlinkMode: "keep" | "remove";
    setUnlinkMode: (mode: "keep" | "remove") => void;
    confirmUnlinkListTools: () => void;
}

export function ListToolsDialogs({
    showReplaceConfirm,
    setShowReplaceConfirm,
    replaceMode,
    setReplaceMode,
    confirmReplaceListTools,
    showUnlinkConfirm,
    setShowUnlinkConfirm,
    unlinkMode,
    setUnlinkMode,
    confirmUnlinkListTools
}: ListToolsDialogsProps) {
    return (
        <>
            {/* Replace Confirmation Dialog */}
            <AlertDialog open={showReplaceConfirm} onOpenChange={setShowReplaceConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Replace List Tools Block?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will create a new List Tools block and link this question to it.
                            Do you want to copy the current transforms (filters, sort, etc.) to the new block?
                        </AlertDialogDescription>
                        <div className="py-4">
                            <RadioGroup value={replaceMode} onValueChange={(v) => setReplaceMode(v as "migrate" | "reset")}>
                                <div className="flex items-start space-x-2 space-y-1">
                                    <RadioGroupItem value="migrate" id="rp-migrate" className="mt-1" />
                                    <div className="grid gap-1.5 leading-none">
                                        <Label htmlFor="rp-migrate" className="font-medium cursor-pointer">
                                            Keep current behavior (Recommended)
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            Initialize the new block with the same filters and sorting as the current one.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start space-x-2 space-y-1 mt-2">
                                    <RadioGroupItem value="reset" id="rp-reset" className="mt-1" />
                                    <div className="grid gap-1.5 leading-none">
                                        <Label htmlFor="rp-reset" className="font-medium cursor-pointer">
                                            Start fresh
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            Create a completely empty block with no transforms.
                                        </p>
                                    </div>
                                </div>
                            </RadioGroup>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmReplaceListTools}>
                            Replace
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Unlink Confirmation Dialog */}
            <AlertDialog open={showUnlinkConfirm} onOpenChange={setShowUnlinkConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Unlink List Tools Block?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This question currently uses a linked List Tools block to generate its options.
                        </AlertDialogDescription>
                        <div className="py-4">
                            <RadioGroup value={unlinkMode} onValueChange={(v) => setUnlinkMode(v as "keep" | "remove")}>
                                <div className="flex items-start space-x-2 space-y-1">
                                    <RadioGroupItem value="keep" id="ul-keep" className="mt-1" />
                                    <div className="grid gap-1.5 leading-none">
                                        <Label htmlFor="ul-keep" className="font-medium cursor-pointer">
                                            Keep current behavior (Recommended)
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            Copy the transforms from the block into this question configuration. The options will remain the same.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start space-x-2 space-y-1 mt-2">
                                    <RadioGroupItem value="remove" id="ul-remove" className="mt-1" />
                                    <div className="grid gap-1.5 leading-none">
                                        <Label htmlFor="ul-remove" className="font-medium cursor-pointer">
                                            Remove transforms
                                        </Label>
                                        <p className="text-sm text-muted-foreground">
                                            Use the original list without any filters or sorting.
                                        </p>
                                    </div>
                                </div>
                            </RadioGroup>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmUnlinkListTools}>
                            Unlink
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
