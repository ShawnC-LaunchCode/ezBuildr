import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import type { ApiPage } from "@/lib/vault-api";
import { useUpdatePage } from "@/lib/vault-hooks";

import type { ValidateRule } from "@shared/types/blocks";

import { PageAdvancedSettings } from "./pages/PageAdvancedSettings";
import { PageGeneralSettings } from "./pages/PageGeneralSettings";
import { ValidationRulesEditor } from "./ValidationRulesEditor";

export function PageSettingsDialog({
    workflowId,
    page,
    isOpen,
    onClose,
    mode = "easy"
}: {
    workflowId: string;
    page: ApiPage | null;
    isOpen: boolean;
    onClose: () => void;
    mode?: "easy" | "advanced";
}) {
    const updatePageMutation = useUpdatePage();
    const { toast } = useToast();

    const [activeTab, setActiveTab] = useState("general");
    const [title, setTitle] = useState(page?.title ?? "");
    const [description, setDescription] = useState(page?.description ?? "");
    // Validation rules are stored in page.config.validationRules
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- API config is unknown
    const [validationRules, setValidationRules] = useState<ValidateRule[]>(((page?.config as any)?.validationRules as ValidateRule[]) ?? []);

    // Sync state when page changes (e.g. opening different page)
    useEffect(() => {
        if (isOpen && page) {
            setTitle(page?.title ?? "");
            setDescription(page?.description ?? "");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- API config is unknown
            setValidationRules(((page?.config as any)?.validationRules as ValidateRule[]) ?? []);
        }
    }, [isOpen, page]);

    const handleSave = async () => {
        if (!page) { return; }
        try {
            await updatePageMutation.mutateAsync({
                id: page.id,
                workflowId,
                title,
                description,
                config: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- config is generic
                    ...(page.config as any),
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
                    <DialogTitle>Page Settings: {page?.title}</DialogTitle>
                    <DialogDescription>Configure page properties and validation rules.</DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                    <TabsList>
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="validation">Validation</TabsTrigger>
                        {mode === 'advanced' && <TabsTrigger value="advanced">Advanced</TabsTrigger>}
                    </TabsList>

                    <TabsContent value="general">
                        <PageGeneralSettings
                            title={title}
                            setTitle={setTitle}
                            description={description}
                            setDescription={setDescription}
                        />
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
                        <TabsContent value="advanced">
                            <PageAdvancedSettings />
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
