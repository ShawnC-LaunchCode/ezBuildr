import { ListTree } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import { Mode } from "@/lib/mode";
import { cn } from "@/lib/utils";
import { ApiPage, ApiBlock } from "@/lib/vault-api";
import { usePages, useCreatePageAtEnd, useCreateStep, useBlocks, useWorkflow } from "@/lib/vault-hooks";

import { AddSnipDialog } from "./AddSnipDialog";
import { AiAssistantDialog } from "./ai/AiAssistantDialog";
import { BlockEditorDialog, type UniversalBlock } from "./BlockEditorDialog";
import { PageSettingsDialog } from "./PageSettingsDialog";
import { DocumentStatusPanel } from "./sidebar/DocumentStatusPanel";
import { PageItem } from "./sidebar/PageItem";
import { SidebarHeader } from "./sidebar/SidebarHeader";


/**
 * Measured against the live render rather than guessed: at the panel's own
 * font the widest action ("Edit with AI", icon + label + the p-4 container)
 * needs 159px, "Add Page" 153px, "Add Snip" 145px. 164 gives those a small
 * buffer and nothing more — an earlier 200 sent the panel to icons across a
 * 172-200px band where every label still fit, which is the band you land in
 * whenever the 15% minSize is dragged to on a 1440px screen.
 *
 * The "Document Outline" heading wants 171px and simply truncates in the
 * narrow band; it is the least load-bearing text here, and letting it drive
 * the switch would drop the actions to icons while they still had room.
 */
const COMPACT_WIDTH_PX = 164;

export function SidebarTree({ workflowId }: { workflowId: string }) {
  const { ref: panelRef, width: panelWidth } = useContainerWidth<HTMLDivElement>();
  // width 0 is the pre-measurement frame; assume roomy so we don't flash compact.
  const isCompact = panelWidth > 0 && panelWidth < COMPACT_WIDTH_PX;
  const { data: workflow } = useWorkflow(workflowId);
  const { data: pages } = usePages(workflowId);
  // const { data: transformBlocks } = useTransformBlocks(workflowId); // Unused
  const mode: Mode = (workflow?.modeOverride as Mode) ?? 'easy';
  const { data: blocks } = useBlocks(workflowId);
  const { createPageAtEnd } = useCreatePageAtEnd(workflowId);
  const createStepMutation = useCreateStep();
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [editingBlock, setEditingBlock] = useState<UniversalBlock | null>(null);
  const [editingPage, setEditingPage] = useState<ApiPage | null>(null);
  const [isBlockEditorOpen, setIsBlockEditorOpen] = useState(false);
  const [isPageSettingsOpen, setIsPageSettingsOpen] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [showSnipDialog, setShowSnipDialog] = useState(false);

  // Group blocks by page
  const blocksByPage = (blocks ?? []).reduce((acc: Record<string, ApiBlock[]>, block: ApiBlock) => {
    if (block.pageId) {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!acc[block.pageId]) { acc[block.pageId] = []; }
      acc[block.pageId].push(block);
    }
    return acc;
  }, {});

  const handleCreatePage = async () => {
    await createPageAtEnd();
  };

  const handleCreateFinalDocumentsPage = async () => {
    const page = await createPageAtEnd({
      title: "Final Documents",
      config: {
        finalBlock: true,
        templates: [],
        screenTitle: "Your Completed Documents",
        markdownMessage: "# Thank You!\n\nYour documents are ready for download below.",
        advanced: {}
      }
    });
    // Create the system step for this page
    await createStepMutation.mutateAsync({
      pageId: page.id,
      type: "final_documents",
      title: "Final Documents",
      description: null,
      required: false,
      alias: "final_documents",
      order: 0,
      config: {},
    });
  };

  const togglePage = (id: string) => {
    setExpandedPages((prev) => {
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
    <div ref={panelRef} className="h-full flex flex-col">
      <div className={cn("flex items-center border-b p-2", isCompact && "justify-center")}>
        {isCompact ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="flex size-7 items-center justify-center text-muted-foreground"
                aria-label="Document Outline"
              >
                <ListTree className="size-4" aria-hidden="true" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">Document Outline</TooltipContent>
          </Tooltip>
        ) : (
          // text-sm, not text-lg: at 18px this panel label outranked the
          // 16px workflow title in the toolbar, and it was the only thing
          // still truncating at the panel's 15% minimum width.
          <h2 className="truncate text-sm font-semibold">Document Outline</h2>
        )}
      </div>
      {/* Authoring actions live in one grouped panel rather than a row of
          ghost buttons in the title bar; the outline below stays navigation. */}
      <SidebarHeader
        onAddPage={() => { void handleCreatePage(); }}
        onAddFinalDocs={() => { void handleCreateFinalDocumentsPage(); }}
        onAiAssist={() => { setShowAiDialog(true); }}
        onAddSnip={() => { setShowSnipDialog(true); }}
        compact={isCompact}
      />
      {mode === 'easy' && workflow?.projectId && (
        <DocumentStatusPanel workflowId={workflowId} projectId={workflow.projectId} />
      )}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {pages && pages.length === 0 && (
            <div className="px-2 py-4 text-center text-muted-foreground">
              <p className="text-balance text-sm">No pages yet.</p>
              <Button
                variant="link"
                onClick={() => { void handleCreatePage(); }}
                className="h-auto whitespace-normal text-balance px-1 py-1 text-sm leading-snug"
              >
                {isCompact ? "Add one" : "Add your first page"}
              </Button>
            </div>
          )}
          {pages?.map((page) => (
            <PageItem
              key={page.id}
              page={page}
              workflowId={workflowId}
              isExpanded={expandedPages.has(page.id)}
              onToggle={() => togglePage(page.id)}
              mode={mode}
              blocks={blocksByPage[page.id] ?? []}
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
              onEditPage={() => {
                setEditingPage(page);
                setIsPageSettingsOpen(true);
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
      {/* Page Settings Dialog */}
      <PageSettingsDialog
        workflowId={workflowId}
        page={editingPage}
        isOpen={isPageSettingsOpen}
        onClose={() => {
          setIsPageSettingsOpen(false);
          setEditingPage(null);
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
