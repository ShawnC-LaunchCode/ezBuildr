
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";

import { CollisionItem } from "./useCollisionResolution";

interface CollisionRowProps {
    item: CollisionItem;
    idx: number;
    error?: string;
    onWorkflowChange: (idx: number, value: string) => void;
    onSnipChange: (idx: number, value: string) => void;
}

export function CollisionRow({
    item,
    idx,
    error,
    onWorkflowChange,
    onSnipChange
}: CollisionRowProps) {
    const snipChanged = item.resolvedSnipAlias !== item.originalSnipAlias;
    const workflowChanged = item.resolvedWorkflowAlias !== item.originalWorkflowAlias;

    return (
        <div className="p-4 bg-background hover:bg-muted/50 transition-colors">
            <div className="grid grid-cols-3 gap-4">
                {/* Existing workflow variable */}
                <div className="space-y-2">
                    <div className="text-sm font-mono text-muted-foreground line-through">
                        {item.originalWorkflowAlias}
                    </div>
                    <Input
                        value={item.resolvedWorkflowAlias}
                        onChange={(e) => { onWorkflowChange(idx, e.target.value); }}
                        className="h-9 font-mono text-sm"
                        placeholder="Enter new name..."
                    />
                    {workflowChanged && (
                        <p className="text-xs text-amber-600 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>Existing logic and documents will reference the new name</span>
                        </p>
                    )}
                </div>

                {/* Incoming snip variable */}
                <div className="space-y-2">
                    <div className="text-sm font-mono text-emerald-700 font-medium">
                        {item.originalSnipAlias}
                    </div>
                    <Input
                        value={item.resolvedSnipAlias}
                        onChange={(e) => { onSnipChange(idx, e.target.value); }}
                        className="h-9 font-mono text-sm"
                        placeholder="Enter new name..."
                    />
                    {snipChanged && (
                        <Alert className="bg-amber-50 border-amber-200 p-2">
                            <AlertDescription className="text-xs text-amber-800 flex items-start gap-1">
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>
                                    Renaming updates mappings, transforms, and hooks in this
                                    workflow automatically, but placeholder text typed inside
                                    uploaded Word templates cannot be rewritten — check the
                                    template validation panel after renaming.
                                </span>
                            </AlertDescription>
                        </Alert>
                    )}
                </div>

                {/* Resolution result */}
                <div className="space-y-2">
                    <div className="text-sm space-y-1">
                        <div className="font-mono text-xs">
                            <span className="text-muted-foreground">Workflow: </span>
                            <span className="font-medium">{item.resolvedWorkflowAlias}</span>
                        </div>
                        <div className="font-mono text-xs">
                            <span className="text-muted-foreground">Snip: </span>
                            <span className="font-medium text-emerald-700">{item.resolvedSnipAlias}</span>
                        </div>
                    </div>
                </div>
            </div>
            {error && (
                <div className="mt-2 text-sm text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                </div>
            )}
        </div>
    );
}
