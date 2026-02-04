
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UI_LABELS } from "@/lib/labels";
import { useUpdateSection, type ApiSection } from "@/lib/vault-hooks";

import { StepEmptyState } from "./StepEmptyState";

export function SectionCanvas({ section, workflowId }: { section: ApiSection; workflowId: string }) {
    const updateMutation = useUpdateSection();

    const handleUpdate = (field: keyof ApiSection, value: unknown) => {
        updateMutation.mutate({ id: section.id, workflowId, [field]: value });
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{UI_LABELS.PAGE_SETTINGS}</CardTitle>
                    <CardDescription>Configure this page&apos;s properties</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="section-title">Title *</Label>
                        <Input
                            id="section-title"
                            value={section.title}
                            onChange={(e) => { handleUpdate("title", e.target.value); }}
                            onBlur={() => { }}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="section-description">Description</Label>
                        <Textarea
                            id="section-description"
                            value={section.description ?? ""}
                            onChange={(e) => { handleUpdate("description", e.target.value); }}
                            rows={4}
                            placeholder="Optional description for this page..."
                        />
                    </div>
                </CardContent>
            </Card>

            <StepEmptyState sectionId={section.id} />
        </div>
    );
}
