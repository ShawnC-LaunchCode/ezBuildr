import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FolderOpen, GripVertical } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { sectionDragId, sortableTransition } from "@/lib/dnd";
import type { ApiPage, ApiSection } from "@/lib/vault-api";

interface CanvasSectionProps {
  section: ApiSection;
  pages: ApiPage[];
  isLandingTarget: boolean;
  children: ReactNode;
}

export function CanvasSection({
  section,
  pages,
  isLandingTarget,
  children,
}: CanvasSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sectionDragId(section.id),
    data: { kind: "section", sectionId: section.id, title: section.title },
  });

  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: sortableTransition(transition),
      }}
      className={cn(
        "rounded-lg border border-border/80 bg-muted/10 p-2 shadow-sm sm:p-3",
        "transition-[border-color,background-color,box-shadow,opacity] duration-150 motion-reduce:transition-none",
        isLandingTarget && "border-primary/60 bg-primary/[0.04] ring-1 ring-primary/20",
        isDragging && "opacity-45",
      )}
      aria-label={`Section ${section.title}`}
      data-canvas-section={section.id}
    >
      <div className="mb-3 flex items-center gap-2 border-b border-border/70 pb-2">
        <button
          type="button"
          className="cursor-grab rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:cursor-grabbing"
          aria-label={`Reorder Section ${section.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <FolderOpen className="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
          {section.title}
        </h3>
        <Badge
          variant="secondary"
          className="h-5 min-w-5 justify-center rounded-sm px-1.5 font-mono text-[10px] tabular-nums"
          aria-label={`${pages.length} ${pages.length === 1 ? "page" : "pages"}`}
        >
          {pages.length}
        </Badge>
      </div>
      <div className="grid grid-cols-[1px_minmax(0,1fr)] gap-x-2 sm:gap-x-3">
        <div className="bg-border" aria-hidden="true" />
        <SortableContext
          items={pages.map((page) => page.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="min-w-0 space-y-4">{children}</div>
        </SortableContext>
      </div>
    </section>
  );
}
