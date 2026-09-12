import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, EyeOff, Trash2 } from "lucide-react";

import { LogicBuilder, LogicStatusText } from "@/components/logic";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { ApiPage, ApiSection } from "@/lib/vault-api";
import { useCreateSection, useDeleteSection, useUpdateSection } from "@/lib/vault-hooks";
import type { ConditionExpression } from "@shared/types/conditions";

interface SectionSettingsDialogProps {
    workflowId: string;
    section: ApiSection | null;
    pages: ApiPage[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function selectionError(pages: ApiPage[], selectedPageIds: Set<string>): string | null {
    if (selectedPageIds.size === 0) {
        return "Select at least one ungrouped page.";
    }
    const ordered = [...pages].sort((a, b) => a.order - b.order);
    const selectedIndexes = ordered
        .map((page, index) => selectedPageIds.has(page.id) ? index : -1)
        .filter((index) => index >= 0);
    const first = selectedIndexes[0];
    const last = selectedIndexes[selectedIndexes.length - 1];
    if (first === undefined || last === undefined) {
        return "Select at least one ungrouped page.";
    }
    const span = ordered.slice(first, last + 1);
    if (span.some((page) => page.sectionId != null || !selectedPageIds.has(page.id))) {
        return "Selected pages must form one continuous ungrouped span.";
    }
    return null;
}

function asConditionExpression(value: unknown): ConditionExpression {
    if (value == null) { return null; }
    if (typeof value !== "object") { return null; }
    const candidate = value as Record<string, unknown>;
    return candidate.type === "group" && Array.isArray(candidate.conditions)
        ? value as ConditionExpression
        : null;
}

function hasSectionEditChanges(
    section: ApiSection | null,
    title: string,
    description: string | null,
    visibleIf: ConditionExpression,
): boolean {
    if (section === null) { return false; }
    return title !== section.title
        || description !== section.description
        || JSON.stringify(visibleIf) !== JSON.stringify(asConditionExpression(section.visibleIf));
}

interface SectionVisibilityEditorProps {
    workflowId: string;
    sectionId?: string;
    value: ConditionExpression;
    onChange: (value: ConditionExpression) => void;
    isSaving: boolean;
}

function SectionVisibilityEditor({
    workflowId,
    sectionId,
    value,
    onChange,
    isSaving,
}: SectionVisibilityEditorProps) {
    const [open, setOpen] = useState(false);
    return (
        <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border bg-background">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" className="h-auto w-full justify-between px-3 py-2">
                    <span className="flex items-center gap-2">
                        <EyeOff className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span className="text-sm font-medium">Visibility</span>
                    </span>
                    <span className="flex items-center gap-2">
                        <LogicStatusText visibleIf={value} />
                        {open
                            ? <ChevronDown className="size-4" aria-hidden="true" />
                            : <ChevronRight className="size-4" aria-hidden="true" />}
                    </span>
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t px-3 pb-3 pt-2">
                <LogicBuilder
                    workflowId={workflowId}
                    elementId={sectionId}
                    elementType="section"
                    value={value}
                    onChange={onChange}
                    isSaving={isSaving}
                />
            </CollapsibleContent>
        </Collapsible>
    );
}

export function SectionSettingsDialog({
    workflowId,
    section,
    pages,
    open,
    onOpenChange,
}: SectionSettingsDialogProps) {
    const isEditing = section !== null;
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [visibleIf, setVisibleIf] = useState<ConditionExpression>(null);
    const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const createSection = useCreateSection();
    const updateSection = useUpdateSection();
    const deleteSection = useDeleteSection();
    const { toast } = useToast();

    useEffect(() => {
        if (!open) { return; }
        setTitle(section?.title ?? "");
        setDescription(section?.description ?? "");
        setVisibleIf(asConditionExpression(section?.visibleIf));
        setSelectedPageIds(new Set());
        setShowDeleteConfirm(false);
    }, [open, section]);

    const orderedUngroupedPages = useMemo(
        () => [...pages]
            .filter((page) => page.sectionId == null)
            .sort((a, b) => a.order - b.order),
        [pages],
    );
    const pageSelectionError = isEditing ? null : selectionError(pages, selectedPageIds);
    const trimmedTitle = title.trim();
    const normalizedDescription = description.trim() || null;
    const hasEditChanges = hasSectionEditChanges(section, trimmedTitle, normalizedDescription, visibleIf);
    const canSubmit = trimmedTitle.length > 0
        && (isEditing || pageSelectionError === null)
        && (!isEditing || hasEditChanges)
        && !createSection.isPending
        && !updateSection.isPending;

    const handleSubmit = async () => {
        if (!canSubmit) { return; }
        try {
            if (section) {
                await updateSection.mutateAsync({
                    id: section.id,
                    workflowId,
                    title: trimmedTitle,
                    description: normalizedDescription,
                    visibleIf,
                });
                toast({ title: "Section updated" });
            } else {
                await createSection.mutateAsync({
                    workflowId,
                    title: trimmedTitle,
                    description: normalizedDescription,
                    visibleIf,
                    pageIds: [...pages]
                        .sort((a, b) => a.order - b.order)
                        .filter((page) => selectedPageIds.has(page.id))
                        .map((page) => page.id),
                });
                toast({ title: "Section created" });
            }
            onOpenChange(false);
        } catch {
            toast({
                title: isEditing ? "Could not update Section" : "Could not create Section",
                description: "Your changes were not saved. Try again.",
                variant: "destructive",
            });
        }
    };

    const handleDelete = async () => {
        if (!section) { return; }
        try {
            await deleteSection.mutateAsync({ id: section.id, workflowId });
            setShowDeleteConfirm(false);
            onOpenChange(false);
            toast({ title: "Section deleted", description: "Its pages are now ungrouped." });
        } catch {
            toast({
                title: "Could not delete Section",
                description: "The Section and its pages are unchanged.",
                variant: "destructive",
            });
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{isEditing ? "Section settings" : "Add Section"}</DialogTitle>
                        <DialogDescription>
                            {isEditing
                                ? "Rename this group without changing its pages."
                                : "Name the Section and choose one continuous span of ungrouped pages."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="section-title">Section title</Label>
                            <Input
                                id="section-title"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder="e.g. Assets"
                                autoFocus
                            />
                            {trimmedTitle.length === 0 && (
                                <p className="text-xs text-destructive">Enter a Section title.</p>
                            )}
                        </div>
                        <SectionVisibilityEditor
                            workflowId={workflowId}
                            sectionId={section?.id}
                            value={visibleIf}
                            onChange={setVisibleIf}
                            isSaving={createSection.isPending || updateSection.isPending}
                        />
                        <div className="space-y-2">
                            <Label htmlFor="section-description">Description <span className="text-muted-foreground">(optional)</span></Label>
                            <Textarea
                                id="section-description"
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                rows={2}
                            />
                        </div>
                        {!isEditing && (
                            <fieldset className="space-y-2">
                                <legend className="text-sm font-medium">Pages in this Section</legend>
                                {orderedUngroupedPages.length === 0 ? (
                                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                                        No ungrouped pages are available. Move a page out of another Section first.
                                    </p>
                                ) : (
                                    <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                                        {orderedUngroupedPages.map((page) => (
                                            <Label
                                                key={page.id}
                                                htmlFor={`section-page-${page.id}`}
                                                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                                            >
                                                <Checkbox
                                                    id={`section-page-${page.id}`}
                                                    checked={selectedPageIds.has(page.id)}
                                                    onCheckedChange={(checked) => {
                                                        setSelectedPageIds((current) => {
                                                            const next = new Set(current);
                                                            if (checked === true) { next.add(page.id); }
                                                            else { next.delete(page.id); }
                                                            return next;
                                                        });
                                                    }}
                                                />
                                                <span className="truncate">{page.title}</span>
                                            </Label>
                                        ))}
                                    </div>
                                )}
                                {pageSelectionError && (
                                    <p className="text-xs text-destructive">{pageSelectionError}</p>
                                )}
                            </fieldset>
                        )}
                    </div>
                    <DialogFooter className="sm:justify-between">
                        {section ? (
                            <Button
                                variant="destructive"
                                onClick={() => setShowDeleteConfirm(true)}
                                disabled={deleteSection.isPending}
                            >
                                <Trash2 className="mr-2 size-4" aria-hidden="true" />
                                Delete Section
                            </Button>
                        ) : <span />}
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button onClick={() => { void handleSubmit(); }} disabled={!canSubmit}>
                                {isEditing ? "Save changes" : "Create Section"}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{section?.title}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The pages in this Section will be kept in the same order and become ungrouped. Only the Section is deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteSection.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault();
                                void handleDelete();
                            }}
                            disabled={deleteSection.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteSection.isPending ? "Deleting…" : "Delete Section"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
