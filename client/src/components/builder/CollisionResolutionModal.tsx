/**
 * Collision Resolution Modal
 * Allows users to resolve alias conflicts when importing Snips
 * 
 * Default behavior: Snip aliases are preserved, existing workflow aliases are renamed
 */
import { AlertTriangle, Info } from "lucide-react";
import React, { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
export interface CollisionItem {
    originalWorkflowAlias: string;
    originalSnipAlias: string;
    resolvedWorkflowAlias: string;
    resolvedSnipAlias: string;
}
interface CollisionResolutionModalProps {
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
    // State: array of collision items with resolution
    const [items, setItems] = useState<CollisionItem[]>([]);
    const [errors, setErrors] = useState<Record<number, string>>({});
    // Initialize items when collisions change
    useEffect(() => {
        if (collisions.length > 0) {
            const initialItems: CollisionItem[] = collisions.map(alias => {
                // Generate auto-renamed workflow alias (add _2 suffix)
                const parts = alias.split('.');
                let renamedWorkflowAlias: string;
                if (parts.length > 1) {
                    // Has namespace: respondent.name.first -> respondent_2.name.first
                    renamedWorkflowAlias = `${parts[0]}_2.${parts.slice(1).join('.')}`;
                } else {
                    // No namespace: name -> name_2
                    renamedWorkflowAlias = `${alias}_2`;
                }
                return {
                    originalWorkflowAlias: alias,
                    originalSnipAlias: alias,
                    resolvedWorkflowAlias: renamedWorkflowAlias,
                    resolvedSnipAlias: alias, // Snip wins by default
                };
            });
            setItems(initialItems);
        }
    }, [collisions]);
    // Validate all items
    const validate = (): boolean => {
        const newErrors: Record<number, string> = {};
        const allResolvedAliases = new Set<string>();
        items.forEach((item, idx) => {
            // Check for empty aliases
            if (!item.resolvedWorkflowAlias.trim()) {
                newErrors[idx] = "Workflow alias cannot be empty";
            }
            if (!item.resolvedSnipAlias.trim()) {
                newErrors[idx] = "Snip alias cannot be empty";
            }
            // Check for invalid characters (basic check)
            const validPattern = /^[a-zA-Z0-9_.]+$/;
            if (!validPattern.test(item.resolvedWorkflowAlias)) {
                newErrors[idx] = "Workflow alias contains invalid characters";
            }
            if (!validPattern.test(item.resolvedSnipAlias)) {
                newErrors[idx] = "Snip alias contains invalid characters";
            }
            // Check for duplicates
            if (allResolvedAliases.has(item.resolvedWorkflowAlias)) {
                newErrors[idx] = "Duplicate alias in resolution";
            }
            if (allResolvedAliases.has(item.resolvedSnipAlias)) {
                newErrors[idx] = "Duplicate alias in resolution";
            }
            allResolvedAliases.add(item.resolvedWorkflowAlias);
            allResolvedAliases.add(item.resolvedSnipAlias);
        });
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };
    const handleWorkflowAliasChange = (idx: number, value: string) => {
        const newItems = [...items];
        newItems[idx].resolvedWorkflowAlias = value;
        setItems(newItems);
    };
    const handleSnipAliasChange = (idx: number, value: string) => {
        const newItems = [...items];
        newItems[idx].resolvedSnipAlias = value;
        setItems(newItems);
    };
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
                        By default, we'll keep the Snip's names and update your existing workflow.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {/* Info banner */}
                    <Alert className="bg-blue-50 border-blue-200">
                        <Info className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-sm text-blue-900">
                            The Snip's variable names are preserved by default. Your existing workflow variables will be renamed with a "_2" suffix.
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
                            {items.map((item, idx) => {
                                const snipChanged = item.resolvedSnipAlias !== item.originalSnipAlias;
                                const workflowChanged = item.resolvedWorkflowAlias !== item.originalWorkflowAlias;
                                return (
                                    <div key={idx} className="p-4 bg-background hover:bg-muted/50 transition-colors">
                                        <div className="grid grid-cols-3 gap-4">
                                            {/* Existing workflow variable */}
                                            <div className="space-y-2">
                                                <div className="text-sm font-mono text-muted-foreground line-through">
                                                    {item.originalWorkflowAlias}
                                                </div>
                                                <Input
                                                    value={item.resolvedWorkflowAlias}
                                                    onChange={(e) => handleWorkflowAliasChange(idx, e.target.value)}
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
                                                    onChange={(e) => handleSnipAliasChange(idx, e.target.value)}
                                                    className="h-9 font-mono text-sm"
                                                    placeholder="Enter new name..."
                                                />
                                                {snipChanged && (
                                                    <Alert className="bg-amber-50 border-amber-200 p-2">
                                                        <AlertDescription className="text-xs text-amber-800 flex items-start gap-1">
                                                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                                            <span>
                                                                This Snip may already be mapped to document templates.
                                                                Changing Snip aliases can break document outputs.
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
                                        {errors[idx] && (
                                            <div className="mt-2 text-sm text-destructive flex items-center gap-1">
                                                <AlertTriangle className="w-4 h-4" />
                                                {errors[idx]}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
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