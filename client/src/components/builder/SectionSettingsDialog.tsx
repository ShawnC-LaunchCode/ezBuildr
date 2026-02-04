import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { ApiSection } from "@/lib/vault-api";
import { useUpdateSection } from "@/lib/vault-hooks";

import type { ValidateRule } from "@shared/types/blocks";

import { ValidationRulesEditor } from "./ValidationRulesEditor";

export function SectionSettingsDialog({
    workflowId,
    section,
    isOpen,
    onClose,
    mode = "easy"
}: {
    workflowId: string;
    section: ApiSection | null;
    isOpen: boolean;
    onClose: () => void;
    mode?: "easy" | "advanced";
}) {
    const updateSectionMutation = useUpdateSection();
    const { toast } = useToast();

    const [activeTab, setActiveTab] = useState("general");
    const [title, setTitle] = useState(section?.title ?? "");
    const [description, setDescription] = useState(section?.description ?? "");
    // Validation rules are stored in section.config.validationRules
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- API config is unknown
    const [validationRules, setValidationRules] = useState<ValidateRule[]>(((section?.config as any)?.validationRules as ValidateRule[]) ?? []);

    // Sync state when section changes (e.g. opening different section)
    useEffect(() => {
        if (isOpen && section) {
            setTitle(section?.title ?? "");
            setDescription(section?.description ?? "");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- API config is unknown
            setValidationRules(((section?.config as any)?.validationRules as ValidateRule[]) ?? []);
        }
    }, [isOpen, section]);

    const handleSave = async () => {
        if (!section) { return; }
        try {
            await updateSectionMutation.mutateAsync({
                id: section.id,
                workflowId,
                title,
                description,
                config: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- config is generic
                    ...(section.config as any),
                    validationRules
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
                            <Input value={title} onChange={(e) => { void setTitle(e.target.value); }} />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                value={description}
                                onChange={(e) => { void setDescription(e.target.value); }}
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
                            mode={mode}
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
                    <Button variant="outline" onClick={() => { void onClose(); }}>Cancel</Button>
                    <Button onClick={() => { void handleSave(); }}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
