import { ListTree } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import { Mode } from "@/lib/mode";
import { cn } from "@/lib/utils";
import { ApiPage, ApiBlock, type ApiSection } from "@/lib/vault-api";
import { usePages, useSections, useCreatePageAtEnd, useCreateStep, useBlocks, useWorkflow } from "@/lib/vault-hooks";

import { AddSnipDialog } from "./AddSnipDialog";
import { AiAssistantDialog } from "./ai/AiAssistantDialog";
import { BlockEditorDialog, type UniversalBlock } from "./BlockEditorDialog";
import { PageSettingsDialog } from "./PageSettingsDialog";
import { SectionSettingsDialog } from "./SectionSettingsDialog";
import { DocumentStatusPanel } from "./sidebar/DocumentStatusPanel";
import { PageItem } from "./sidebar/PageItem";
import { SectionItem } from "./sidebar/SectionItem";
import { SidebarHeader } from "./sidebar/SidebarHeader";


/**
 * Re-measured in the live builder after "Add Section" joined the action rail.
 * At a 1280px viewport the 15% floor is a 192.6px panel / 160.6px action and
 * every label fits without overflow. At a 1024px viewport the actual floor is
 * 149.1px, below this switch, and all four actions render as 32px icon buttons
 * with accessible names and tooltips. 164 keeps a small buffer between those
 * verified states; a former 200px switch hid labels that still fit.
 *
 * The "Document Outline" heading wants 171px and simply truncates in the
 * narrow band; it is the least load-bearing text here, and letting it drive
 * the switch would drop the actions to icons while they still had room.
 */
const COMPACT_WIDTH_PX = 164;

interface SectionedOutlineProps {
  sections: ApiSection[];
  pages: ApiPage[];
  expandedSections: Set<string>;
  onToggleSection: (id: string) => void;
  onEditSection: (section: ApiSection) => void;
  renderPage: (page: ApiPage, nested?: boolean) => ReactNode;
}

function SectionedOutline({
  sections,
  pages,
  expandedSections,
  onToggleSection,
  onEditSection,
  renderPage,
}: SectionedOutlineProps) {
  const orderedPages = [...pages].sort((a, b) => a.order - b.order);
  const sectionsById = new Map(sections.map((section) => [section.id, section]));
  const pagesBySection = new Map<string, ApiPage[]>();
  for (const page of orderedPages) {
    if (!page.sectionId || !sectionsById.has(page.sectionId)) { continue; }
    const members = pagesBySection.get(page.sectionId) ?? [];
    members.push(page);
    pagesBySection.set(page.sectionId, members);
  }
  const emittedSections = new Set<string>();

  return orderedPages.map((page) => {
    const section = page.sectionId ? sectionsById.get(page.sectionId) : undefined;
    if (!section) { return renderPage(page); }
    if (emittedSections.has(section.id)) { return null; }
    emittedSections.add(section.id);
    const memberPages = pagesBySection.get(section.id) ?? [];
    return (
      <SectionItem
        key={section.id}
        section={section}
        pageCount={memberPages.length}
        isExpanded={expandedSections.has(section.id)}
        onToggle={() => onToggleSection(section.id)}
        onEdit={() => onEditSection(section)}
      >
        {memberPages.map((memberPage) => renderPage(memberPage, true))}
      </SectionItem>
    );
  });
}

interface OutlineBodyProps extends Omit<SectionedOutlineProps, "pages"> {
  pages: ApiPage[] | undefined;
  isLoading: boolean;
  isError: boolean;
  compact: boolean;
  onCreatePage: () => void;
}

function OutlineBody({
  sections,
  pages,
  expandedSections,
  onToggleSection,
  onEditSection,
  renderPage,
  isLoading,
  isError,
  compact,
  onCreatePage,
}: OutlineBodyProps) {
  if (isLoading) {
    return (
      <div role="status" aria-label="Loading outline" className="space-y-2 px-1 py-2">
        {["w-4/5", "w-3/5", "w-3/4"].map((width) => (
          <div key={width} className="flex h-8 items-center gap-2 rounded-md px-2">
            <span className="size-3 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
            <span className={`h-3 ${width} animate-pulse rounded-sm bg-muted motion-reduce:animate-none`} />
          </div>
        ))}
        <span className="sr-only">Loading outline…</span>
      </div>
    );
  }
  if (isError) {
    return (
      <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-3 text-center text-xs text-destructive">
        The outline could not be loaded. Try refreshing.
      </div>
    );
  }
  if (pages?.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-muted-foreground">
        <p className="text-balance text-sm">No pages yet.</p>
        <Button
          variant="link"
          onClick={onCreatePage}
          className="h-auto whitespace-normal text-balance px-1 py-1 text-sm leading-snug"
        >
          {compact ? "Add one" : "Add your first page"}
        </Button>
      </div>
    );
  }
  if (sections.length === 0) {
    return pages?.map((page) => renderPage(page));
  }
  return (
    <SectionedOutline
      sections={sections}
      pages={pages ?? []}
      expandedSections={expandedSections}
      onToggleSection={onToggleSection}
      onEditSection={onEditSection}
      renderPage={renderPage}
    />
  );
}

export function SidebarTree({ workflowId }: { workflowId: string }) {
  const { ref: panelRef, width: panelWidth } = useContainerWidth<HTMLDivElement>();
  // width 0 is the pre-measurement frame; assume roomy so we don't flash compact.
  const isCompact = panelWidth > 0 && panelWidth < COMPACT_WIDTH_PX;
  const { data: workflow } = useWorkflow(workflowId);
  const { data: pages, isLoading: pagesLoading, isError: pagesError } = usePages(workflowId);
  const { data: sections = [], isLoading: sectionsLoading, isError: sectionsError } = useSections(workflowId);
  // const { data: transformBlocks } = useTransformBlocks(workflowId); // Unused
  const mode: Mode = (workflow?.modeOverride as Mode) ?? 'easy';
  const { data: blocks } = useBlocks(workflowId);
  const { createPageAtEnd } = useCreatePageAtEnd(workflowId);
  const createStepMutation = useCreateStep();
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editingBlock, setEditingBlock] = useState<UniversalBlock | null>(null);
  const [editingPage, setEditingPage] = useState<ApiPage | null>(null);
  const [isBlockEditorOpen, setIsBlockEditorOpen] = useState(false);
  const [isPageSettingsOpen, setIsPageSettingsOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<ApiSection | null>(null);
  const [isSectionSettingsOpen, setIsSectionSettingsOpen] = useState(false);
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

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else { next.add(id); }
      return next;
    });
  };

  const renderPage = (page: ApiPage, nested = false) => (
    <PageItem
      key={page.id}
      page={page}
      workflowId={workflowId}
      isExpanded={expandedPages.has(page.id)}
      onToggle={() => togglePage(page.id)}
      mode={mode}
      blocks={blocksByPage[page.id] ?? []}
      nested={nested}
      onEditBlock={(rawBlock) => {
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
  );

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
        onAddSection={() => {
          setEditingSection(null);
          setIsSectionSettingsOpen(true);
        }}
        compact={isCompact}
      />
      {mode === 'easy' && workflow?.projectId && (
        <DocumentStatusPanel workflowId={workflowId} projectId={workflow.projectId} />
      )}
      <ScrollArea className="flex-1">
        <div className="p-2">
          <OutlineBody
            sections={sections}
            pages={pages}
            expandedSections={expandedSections}
            onToggleSection={toggleSection}
            onEditSection={(section) => {
              setEditingSection(section);
              setIsSectionSettingsOpen(true);
            }}
            renderPage={renderPage}
            isLoading={pagesLoading === true || sectionsLoading === true}
            isError={pagesError === true || sectionsError === true}
            compact={isCompact}
            onCreatePage={() => { void handleCreatePage(); }}
          />
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
      <SectionSettingsDialog
        workflowId={workflowId}
        section={editingSection}
        pages={pages ?? []}
        open={isSectionSettingsOpen}
        onOpenChange={(open) => {
          setIsSectionSettingsOpen(open);
          if (!open) { setEditingSection(null); }
        }}
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
