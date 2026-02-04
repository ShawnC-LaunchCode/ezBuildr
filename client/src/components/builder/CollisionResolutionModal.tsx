/**
 * Collision Resolution Modal
 * Allows users to resolve alias conflicts when importing Snips
 * 
 * Default behavior: Snip aliases are preserved, existing workflow aliases are renamed
 */
import { AlertTriangle, Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

import { CollisionRow } from "./snips/CollisionRow";
import { useCollisionResolution } from "./snips/useCollisionResolution";

export interface CollisionResolutionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    collisions: string[]; // Array of conflicting aliases
    onResolve: (resolutions: Record<string, string>) => void; // Map: old alias -> new alias
    onCancel: () => void;
}

export function CollisionResolutionModal({
    open,
    onOpenChange,
    collisions,
    onResolve,
    onCancel,
}: CollisionResolutionModalProps) {
    const {
        items,
        errors,
        validate,
        handleWorkflowAliasChange,
        handleSnipAliasChange
    } = useCollisionResolution(collisions);

    const handleContinue = () => {
        if (!validate()) {
            return;
        }

        // Build final mapping
        // Map old workflow aliases to new workflow aliases
        // Map old snip aliases to final snip aliases (usually unchanged)
        const resolutions: Record<string, string> = {};
        items.forEach(item => {
            // If workflow alias changed, add mapping
            if (item.originalWorkflowAlias !== item.resolvedWorkflowAlias) {
                resolutions[item.originalWorkflowAlias] = item.resolvedWorkflowAlias;
            }
            // If snip alias changed, add mapping
            if (item.originalSnipAlias !== item.resolvedSnipAlias) {
                resolutions[item.originalSnipAlias] = item.resolvedSnipAlias;
            }
        });

        onResolve(resolutions);
    };

    const handleCancel = () => {
        onCancel();
        onOpenChange(false);
    };

    const isValid = Object.keys(errors).length === 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        Resolve Naming Conflicts
                    </DialogTitle>
                    <DialogDescription>
                        Two questions use the same name. We need to rename one to avoid confusion.
                        By default, we&apos;ll keep the Snip&apos;s names and update your existing workflow.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Info banner */}
                    <Alert className="bg-blue-50 border-blue-200">
                        <Info className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-sm text-blue-900">
                            The Snip&apos;s variable names are preserved by default. Your existing workflow variables will be renamed with a &quot;_2&quot; suffix.
                        </AlertDescription>
                    </Alert>

                    {/* Collision table */}
                    <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted px-4 py-3 border-b">
                            <div className="grid grid-cols-3 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                <div>Existing Workflow Variable</div>
                                <div>Incoming Snip Variable</div>
                                <div>After Import</div>
                            </div>
                        </div>
                        <div className="divide-y">
                            {items.map((item, idx) => (
                                <CollisionRow
                                    key={idx}
                                    item={item}
                                    idx={idx}
                                    error={errors[idx]}
                                    onWorkflowChange={handleWorkflowAliasChange}
                                    onSnipChange={handleSnipAliasChange}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleCancel}>
                        Cancel Import
                    </Button>
                    <Button
                        onClick={handleContinue}
                        disabled={!isValid}
                        className="bg-emerald-600 hover:bg-emerald-700"
                    >
                        Continue with Import
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}