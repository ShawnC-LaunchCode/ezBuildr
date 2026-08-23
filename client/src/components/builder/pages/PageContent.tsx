import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FileText } from "lucide-react";

import { CardContent } from "@/components/ui/card";
import { PageItem } from "@/lib/dnd";
import { UI_LABELS } from "@/lib/labels";
import { ApiPage } from "@/lib/vault-api";

import { StepCard } from "../cards/StepCard";
import { FinalDocumentsPageEditor } from "../final/FinalDocumentsPageEditor";

import { BlockCard } from "./BlockCard";
import { LogicAddMenu } from "./LogicAddMenu";
import { QuestionAddMenu } from "./QuestionAddMenu";

interface PageContentProps {
    page: ApiPage;
    workflowId: string;
    mode: string;
    isFinalDocumentsPage: boolean;
    items: PageItem[];
    expandedStepIds: Set<string>;
    expandedBlockIds: Set<string>;
    autoFocusStepId: string | null;
    nextOrder: number;
    onSelectStep: (id: string) => void;
    onSelectBlock: (id: string) => void;
    onSetExpandedStepIds: (callback: (prev: Set<string>) => Set<string>) => void;
    onSetAutoFocusStepId: (id: string | null) => void;
    onToggleExpand: (id: string) => void;
    onToggleBlockExpand: (id: string) => void;
    onEditBlock?: (id: string) => void;
}

export function PageContent({
    page,
    workflowId,
    mode,
    isFinalDocumentsPage,
    items,
    expandedStepIds,
    expandedBlockIds,
    autoFocusStepId,
    nextOrder,
    onSelectStep,
    onSelectBlock,
    onSetExpandedStepIds,
    onSetAutoFocusStepId,
    onToggleExpand,
    onToggleBlockExpand,
    onEditBlock,
}: PageContentProps) {
    return (
        <CardContent className="pt-0 space-y-3">
            {isFinalDocumentsPage ? (
                <FinalDocumentsPageEditor page={page} workflowId={workflowId} />
            ) : items.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                    {mode === "easy" ? (
                        <>
                            <div className="p-3 bg-amber-50 rounded-full mb-2">
                                <FileText className="w-6 h-6 text-amber-500" />
                            </div>
                            <p className="font-medium text-amber-900">
                                Add your first question to this page
                            </p>
                            <p className="text-xs text-amber-700 max-w-xs">
                                Start by asking something simple. You can always add more pages
                                later.
                            </p>
                        </>
                    ) : (
                        UI_LABELS.NO_QUESTIONS
                    )}
                </div>
            ) : (
                <SortableContext
                    items={items.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-2">
                        {items.map((item, itemIndex) => {
                            const handleEnterNext = () => {
                                // Find next item in list
                                if (itemIndex < items.length - 1) {
                                    const nextItem = items[itemIndex + 1];
                                    if (nextItem.kind === "step") {
                                        // Select and expand next step
                                        onSelectStep(nextItem.id);
                                        onSetExpandedStepIds((prev) =>
                                            new Set(prev).add(nextItem.id)
                                        );
                                        onSetAutoFocusStepId(nextItem.id);
                                    } else {
                                        // Just select next block
                                        onSelectBlock(nextItem.id);
                                    }
                                }
                            };

                            if (item.kind === "step") {
                                return (
                                    <StepCard
                                        key={item.id}
                                        step={item.data}
                                        pageId={page.id}
                                        workflowId={workflowId}
                                        isExpanded={expandedStepIds.has(item.id)}
                                        autoFocus={autoFocusStepId === item.id}
                                        onToggleExpand={() => onToggleExpand(item.id)}
                                        onEnterNext={handleEnterNext}
                                    />
                                );
                            } else {
                                return (
                                    <BlockCard
                                        key={item.id}
                                        item={item}
                                        workflowId={workflowId}
                                        pageId={page.id}
                                        isExpanded={expandedBlockIds.has(item.id)}
                                        onToggleExpand={() => onToggleBlockExpand(item.id)}
                                        onEnterNext={handleEnterNext}
                                        onEdit={() => onEditBlock?.(item.id)}
                                    />
                                );
                            }
                        })}
                    </div>
                </SortableContext>
            )}

            {/* Add buttons at the bottom - hidden for Final Documents pages */}
            {!isFinalDocumentsPage && (
                <div className="space-y-2">
                    {mode === "easy" && items.length > 0 && (
                        <div className="flex items-center gap-2 px-1 pb-1 animate-in fade-in slide-in-from-top-1">
                            <span className="text-[10px] text-muted-foreground italic">
                                You can add another question here, or create a new page below.
                            </span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 pt-2">
                        <QuestionAddMenu
                            pageId={page.id}
                            nextOrder={nextOrder}
                            workflowId={workflowId}
                        />
                        <LogicAddMenu
                            workflowId={workflowId}
                            pageId={page.id}
                            nextOrder={nextOrder}
                        />
                    </div>
                </div>
            )}
        </CardContent>
    );
}
