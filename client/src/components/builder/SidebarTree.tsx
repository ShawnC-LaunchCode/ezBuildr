
/**
 * Sidebar Tree - Drag-and-drop page/question hierarchy
 */
import { Plus, FileText, FileCheck, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
      if (!acc[block.sectionId]) { acc[block.sectionId] = []; }
      acc[block.sectionId].push(block);
    }
    return acc;
  }, {});

  const handleCreateSection = async () => {
    const order = sections?.length ?? 0;
    await createSectionMutation.mutateAsync({
      workflowId,
      title: `${UI_LABELS.PAGE} ${order + 1}`,
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
      <div className="p-4 border-b space-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              {UI_LABELS.ADD_PAGE}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => { void handleCreateSection(); }}>
              <FileText className="w-4 h-4 mr-2" />
              Regular Page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { void handleCreateFinalDocumentsSection(); }}>
              <FileCheck className="w-4 h-4 mr-2" />
              Final Documents Section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* AI Assistant Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
          onClick={() => { void setShowAiDialog(true); }}
        >
          <Sparkles className="w-3 h-3 mr-2" />
          Edit with AI
        </Button>
        {/* Add Snip Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          onClick={() => { void setShowSnipDialog(true); }}
        >
          <Plus className="w-3 h-3 mr-2" />
          Add Snip
        </Button>
      </div>
      {mode === 'easy' && workflow?.projectId && (
        <DocumentStatusPanel workflowId={workflowId} projectId={workflow.projectId} />
      )}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {sections && sections.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4 animate-in fade-in duration-500">
              <div className="p-3 bg-indigo-50 rounded-full mb-3 ring-4 ring-indigo-50/50">
                <FileText className="w-5 h-5 text-indigo-600" />
              </div>
              <h4 className="font-medium text-sm text-foreground mb-1">Start Building</h4>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Pages are the main steps of your workflow. Add one to begin.
              </p>
              <div className="relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-indigo-200"></div>
                <Button onClick={() => { void handleCreateSection(); }} size="sm" className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add First Page
                </Button>
              </div>
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