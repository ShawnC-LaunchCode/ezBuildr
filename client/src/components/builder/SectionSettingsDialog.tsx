import React, { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea"; // Assuming we might want description
import { useToast } from "@/hooks/use-toast";
import { useUpdateSection } from "@/lib/vault-hooks";

import type { ValidateRule } from "@shared/types/blocks"; // Need to ensure this is importable

import { ValidationRulesEditor } from "./ValidationRulesEditor";

export function SectionSettingsDialog({
    workflowId,
    section,
    isOpen,
    onClose,
    mode = "easy"
}: {
    workflowId: string;
    section: any;
    isOpen: boolean;
    onClose: () => void;
    mode?: "easy" | "advanced";
}) {
    const updateSectionMutation = useUpdateSection();
    const { toast } = useToast();

    const [activeTab, setActiveTab] = useState("general");
    const [title, setTitle] = useState(section?.title || "");
    const [description, setDescription] = useState(section?.description || "");
    // Validation rules are stored in section.config.validationRules
    const [validationRules, setValidationRules] = useState<ValidateRule[]>(section?.config?.validationRules || []);

    // Sync state when section changes (e.g. opening different section)
    useEffect(() => {
        if (isOpen && section) {
            setTitle(section?.title || "");
            setDescription(section?.description || "");
            setValidationRules(section?.config?.validationRules || []);
        }
    }, [isOpen, section]);

    const handleSave = async () => {
        try {
            await updateSectionMutation.mutateAsync({
                id: section.id,
                workflowId,
                title,
                description,
                config: {
                    ...section.config,
                    validationRules: validationRules
                }
            });
            toast({ title: "Success", description: "Page settings saved." });
            onClose();
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Failed to save page settings.", variant: "destructive" });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Page Settings: {section?.title}</DialogTitle>
                    <DialogDescription>Configure page properties and validation rules.</DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                    <TabsList>
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="validation">Validation</TabsTrigger>
                        {mode === 'advanced' && <TabsTrigger value="advanced">Advanced</TabsTrigger>}
                    </TabsList>

                    <TabsContent value="general" className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Page Title</Label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Internal description or notes (optional)"
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="validation" className="space-y-4 py-4">
                        <div className="bg-amber-50 border border-amber-200 p-3 rounded-md text-sm text-amber-800 mb-4">
                            Define rules that must pass before the user can proceed to the next page.
                        </div>
                        <ValidationRulesEditor
                            rules={validationRules}
                            onChange={setValidationRules}
                            workflowId={workflowId}
                            mode={mode as any}
                        />
                    </TabsContent>

                    {mode === 'advanced' && (
                        <TabsContent value="advanced" className="py-4">
                            <div className="p-4 border border-dashed rounded text-center text-muted-foreground">
                                Advanced visibility/logic settings coming soon.
                            </div>
                        </TabsContent>
                    )}
                </Tabs>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
