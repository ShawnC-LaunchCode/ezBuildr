import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UI_LABELS } from "@/lib/labels";
import { Mode } from "@/lib/mode";
import { ApiSection, ApiBlock } from "@/lib/vault-api";
import { useSections, useCreateSection, useCreateStep, useBlocks, useWorkflow } from "@/lib/vault-hooks";

import { AddSnipDialog } from "./AddSnipDialog";
import { AiAssistantDialog } from "./ai/AiAssistantDialog";
import { BlockEditorDialog, type UniversalBlock } from "./BlockEditorDialog";
import { SectionSettingsDialog } from "./SectionSettingsDialog";
import { DocumentStatusPanel } from "./sidebar/DocumentStatusPanel";
import { SectionItem } from "./sidebar/SectionItem";
import { SidebarEmptyState } from "./sidebar/SidebarEmptyState";
import { SidebarHeader } from "./sidebar/SidebarHeader";

export function SidebarTree({ workflowId }: { workflowId: string }) {
  const { data: workflow } = useWorkflow(workflowId);
  const { data: sections } = useSections(workflowId);
  // const { data: transformBlocks } = useTransformBlocks(workflowId); // Unused
  const mode: Mode = (workflow?.modeOverride as Mode) ?? 'easy';
  const { data: blocks } = useBlocks(workflowId);
  const createSectionMutation = useCreateSection();
  const createStepMutation = useCreateStep();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editingBlock, setEditingBlock] = useState<UniversalBlock | null>(null);
  const [editingSection, setEditingSection] = useState<ApiSection | null>(null);
  const [isBlockEditorOpen, setIsBlockEditorOpen] = useState(false);
  const [isSectionSettingsOpen, setIsSectionSettingsOpen] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [showSnipDialog, setShowSnipDialog] = useState(false);

  // Group blocks by section
  const blocksBySection = (blocks ?? []).reduce((acc: Record<string, ApiBlock[]>, block: ApiBlock) => {
    if (block.sectionId) {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!acc[block.sectionId]) { acc[block.sectionId] = []; }
      acc[block.sectionId].push(block);
    }
    return acc;
  }, {});

  const handleCreateSection = async () => {
    const order = sections?.length ?? 0;
    await createSectionMutation.mutateAsync({
      workflowId,
      title: `${UI_LABELS.PAGE} ${order + 1} `,
      order,
    });
  };

  const handleCreateFinalDocumentsSection = async () => {
    const order = sections?.length ?? 0;
    const section = await createSectionMutation.mutateAsync({
      workflowId,
      title: "Final Documents",
      order,
      config: {
        finalBlock: true,
        templates: [],
        screenTitle: "Your Completed Documents",
        markdownMessage: "# Thank You!\n\nYour documents are ready for download below.",
        advanced: {}
      }
    });
    // Create the system step for this section
    await createStepMutation.mutateAsync({
      sectionId: section.id,
      type: "final_documents",
      title: "Final Documents",
      description: null,
      required: false,
      alias: "final_documents",
      options: null,
      order: 0,
      config: {},
    });
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between border-b p-2">
        <h2 className="text-lg font-semibold">Document Outline</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => { void handleCreateSection(); }}>
            Add Page
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { void handleCreateFinalDocumentsSection(); }}>
            Add Final Docs
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { void setShowAiDialog(true); }}>
            AI Assist
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { void setShowSnipDialog(true); }}>
            Add Snip
          </Button>
        </div>
      </div>
      {mode === 'easy' && workflow?.projectId && (
        <DocumentStatusPanel workflowId={workflowId} projectId={workflow.projectId} />
      )}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {sections && sections.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">
              <p>No sections yet.</p>
              <Button variant="link" onClick={() => { void handleCreateSection(); }}>
                Click here to add your first page.
              </Button>
            </div>
          )}
          {sections?.map((section) => (
            <SectionItem
              key={section.id}
              section={section}
              workflowId={workflowId}
              isExpanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              mode={mode}
              blocks={blocksBySection[section.id] ?? []}
              onEditBlock={(rawBlock) => {
                // Transform raw block to UniversalBlock format
                const universalBlock: UniversalBlock = {
                  id: rawBlock.id,
                  type: rawBlock.type,
                  phase: rawBlock.phase,
                  order: rawBlock.order,
                  enabled: rawBlock.enabled,
                  raw: rawBlock as unknown as Record<string, unknown>,
                  source: 'regular',
                  title: undefined,
                  displayType: rawBlock.type,
                };
                setEditingBlock(universalBlock);
                setIsBlockEditorOpen(true);
              }}
              onEditSection={() => {
                setEditingSection(section);
                setIsSectionSettingsOpen(true);
              }}
            />
          ))}
        </div>
      </ScrollArea>
      {/* Block Editor Dialog */}
      <BlockEditorDialog
        workflowId={workflowId}
        block={editingBlock}
        mode={mode}
        isOpen={isBlockEditorOpen}
        onClose={() => {
          setIsBlockEditorOpen(false);
          setEditingBlock(null);
        }}
      />
      {/* Section Settings Dialog */}
      <SectionSettingsDialog
        workflowId={workflowId}
        section={editingSection}
        isOpen={isSectionSettingsOpen}
        onClose={() => {
          setIsSectionSettingsOpen(false);
          setEditingSection(null);
        }}
        mode={mode}
      />
      <AiAssistantDialog
        workflowId={workflowId}
        open={showAiDialog}
        onOpenChange={setShowAiDialog}
      />
      <AddSnipDialog
        workflowId={workflowId}
        open={showSnipDialog}
        onOpenChange={setShowSnipDialog}
      />
    </div>
  );
}