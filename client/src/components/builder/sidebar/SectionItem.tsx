
import { UI_LABELS } from "@/lib/labels";
import { type Mode } from "@/lib/mode";

import { ApiBlock, ApiSection } from "@/lib/vault-api";
import { useCreateBlock, useCreateStep, useSteps } from "@/lib/vault-hooks";

import { BlockTreeItem } from "./BlockTreeItem";
import { SectionItemHeader } from "./SectionItemHeader";
import { StepItem } from "./StepItem";

interface SectionItemProps {
    section: ApiSection;
    workflowId: string;
    isExpanded: boolean;
    onToggle: () => void;
    mode: Mode;
    blocks: ApiBlock[];
    onEditBlock: (block: ApiBlock) => void;
    onEditSection: () => void;
}

export function SectionItem({
    section,
    workflowId,
    isExpanded,
    onToggle,
    mode,
    blocks,
    onEditBlock,
    onEditSection,
}: SectionItemProps) {
    const { data: steps } = useSteps(section.id);
    const createStepMutation = useCreateStep();
    const createBlockMutation = useCreateBlock();
    // Check if this is a Final Documents section
    const isFinalSection = (section.config as Record<string, unknown> | undefined)?.finalBlock === true;
    // Don't show page-level required pill based on questions - only show if page is conditional
    const isPageConditional = !!section.visibleIf;

    const createStep = async () => {
        // Prevent adding questions to Final Documents sections
        if (isFinalSection) {
            return;
        }
        const order = steps?.length ?? 0;
        await createStepMutation.mutateAsync({
            sectionId: section.id,
            type: "short_text",
            title: `${UI_LABELS.QUESTION} ${order + 1}`,
            description: null,
            required: false,
            alias: null,
            options: null,
            order,
            config: {},
        });
        if (!isExpanded) { onToggle(); }
    };

    const handleCreateLogicBlock = async (type: "write" | "read_table" | "list_tools" | "external_send") => {
        const order = blocks?.length ?? 0;
        // Default configs for quick-add
        const config = type === "write" ? {
            dataSourceId: "",
            tableId: "",
            mode: "upsert",
            columnMappings: []
        } : type === "read_table" ? {
            tableId: "",
            outputKey: "list_data",
            filters: []
        } : {};

        await createBlockMutation.mutateAsync({
            workflowId,
            type,
            phase: "onSectionSubmit",
            sectionId: section.id,
            config,
            enabled: true,
            order
        });
        if (!isExpanded) { onToggle(); }
    };

    // Blocks have phases. 
    // onSectionEnter -> Top
    // onSectionSubmit -> Bottom
    const topBlocks = blocks.filter(b => b.phase === 'onSectionEnter' || b.phase === 'onRunStart');
    const bottomBlocks = blocks.filter(b => !topBlocks.includes(b)); // Submit, Next, etc.

    return (
        <div className="mb-1">
            <SectionItemHeader
                section={section}
                isExpanded={isExpanded}
                onToggle={onToggle}
                mode={mode}
                onEditSection={onEditSection}
                onCreateStep={() => { void createStep(); }}
                onAddBlock={(type) => { void handleCreateLogicBlock(type); }}
                isFinalSection={isFinalSection}
                isPageConditional={isPageConditional}
            />
            {isExpanded && (
                <div className="ml-4 pl-2 mt-1 space-y-0.5 border-l border-sidebar-border/50">
                    {/* Top Blocks (Prefill/Enter) */}
                    {topBlocks.map((block) => (
                        <BlockTreeItem key={block.id} block={block} mode={mode} onEdit={() => onEditBlock(block)} workflowId={workflowId} />
                    ))}
                    {/* Steps */}
                    {steps && steps.length > 0 &&
                        steps
                            .filter((step) => step.type !== 'final_documents' && !isFinalSection)
                            .map((step) => (
                                <StepItem key={step.id} step={step} sectionId={section.id} />
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
