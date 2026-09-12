
import { type Mode } from "@/lib/mode";
import { cn } from "@/lib/utils";

import { ApiBlock, ApiPage } from "@/lib/vault-api";
import { useSteps } from "@/lib/vault-hooks";

import { BlockTreeItem } from "./BlockTreeItem";
import { PageItemHeader } from "./PageItemHeader";
import { StepItem } from "./StepItem";

interface PageItemProps {
    page: ApiPage;
    workflowId: string;
    isExpanded: boolean;
    onToggle: () => void;
    mode: Mode;
    blocks: ApiBlock[];
    onEditBlock: (block: ApiBlock) => void;
    onEditPage: () => void;
    nested?: boolean;
}

export function PageItem({
    page,
    workflowId,
    isExpanded,
    onToggle,
    mode,
    blocks,
    onEditBlock,
    onEditPage,
    nested = false,
}: PageItemProps) {
    const { data: steps } = useSteps(page.id);
    // Check if this is a Final Documents page
    const isFinalPage = (page.config as Record<string, unknown> | undefined)?.finalBlock === true;
    // Don't show page-level required pill based on questions - only show if page is conditional
    const isPageConditional = !!page.visibleIf;

    // Blocks have phases. 
    // onPageEnter -> Top
    // onPageSubmit -> Bottom
    const topBlocks = blocks.filter(b => b.phase === 'onPageEnter' || b.phase === 'onRunStart');
    const bottomBlocks = blocks.filter(b => !topBlocks.includes(b)); // Submit, Next, etc.

    return (
        <div className={cn("mb-1", nested && "mb-0.5")}>
            <PageItemHeader
                page={page}
                isExpanded={isExpanded}
                onToggle={onToggle}
                onEditPage={onEditPage}
                isFinalPage={isFinalPage}
                isPageConditional={isPageConditional}
                nested={nested}
            />
            {isExpanded && (
                <div className={cn(
                    "mt-1 space-y-0.5 border-l border-sidebar-border/50",
                    nested ? "ml-3 pl-1.5" : "ml-4 pl-2",
                )}>
                    {/* Top Blocks (Prefill/Enter) */}
                    {topBlocks.map((block) => (
                        <BlockTreeItem key={block.id} block={block} mode={mode} onEdit={() => onEditBlock(block)} workflowId={workflowId} />
                    ))}
                    {/* Steps */}
                    {steps && steps.length > 0 &&
                        steps
                            .filter((step) => step.type !== 'final_documents' && !isFinalPage)
                            .map((step) => (
                                <StepItem key={step.id} step={step} pageId={page.id} />
                            ))}
                    {/* Bottom Blocks (Submit/Next) */}
                    {bottomBlocks.map((block) => (
                        <BlockTreeItem key={block.id} block={block} mode={mode} onEdit={() => onEditBlock(block)} workflowId={workflowId} />
                    ))}
                </div>
            )}
        </div>
    );
}
