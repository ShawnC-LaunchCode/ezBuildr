/**
 * Move a workflow into a project, or back out to unfiled.
 *
 * Deliberately shaped like its siblings `CopyAssetDialog` and
 * `TransferOwnershipDialog`: the same bordered selectable rows, circular icon
 * badge, and name-over-subtitle layout, so the three organize-actions on a
 * workflow's menu read as one family rather than three authors.
 *
 * The ownership notice is not decoration. `WorkflowService.moveToProject`
 * rewrites the workflow's `ownerType`/`ownerUuid` to match its destination and
 * cascades that onto every run, so filing a personal workflow into an org-owned
 * project hands it to the whole organization — the same consequence
 * `TransferOwnershipDialog` warns about, reached through a different door.
 *
 * Note on colors: theme tokens are declared as complete `hsl(...)` strings, so
 * Tailwind drops every opacity modifier applied to them (`bg-primary/10` emits
 * no rule at all). Backgrounds here are solid tokens or literal palette colors
 * for that reason — see SECT-B11.
 */

import { AlertCircle, Folder, FolderOpen, Move, Search, Users } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ApiProject, ApiWorkflow } from "@/lib/vault-api";
import { cn } from "@/lib/utils";

/** Sentinel for "no project", since a radio group cannot carry a null value. */
const UNFILED = "__unfiled__";

/** Above this many destinations the list stops being scannable by eye. */
const FILTER_THRESHOLD = 6;

interface MoveWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: ApiWorkflow | null;
  /** Projects the viewer can file into. "Other Project" should already be filtered out. */
  projects: ApiProject[];
  onMove: (projectId: string | null) => Promise<void>;
  isPending?: boolean;
}

interface DestinationRowProps {
  value: string;
  title: string;
  subtitle: string;
  icon: typeof Folder;
  iconClassName: string;
  isCurrent: boolean;
}

function DestinationRow({
  value,
  title,
  subtitle,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  icon: Icon,
  iconClassName,
  isCurrent,
}: DestinationRowProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center space-x-2 rounded-lg border p-3 transition-colors",
        isCurrent ? "bg-muted" : "hover:bg-accent"
      )}
    >
      <RadioGroupItem value={value} id={`move-dest-${value}`} />
      <Label
        htmlFor={`move-dest-${value}`}
        className="flex flex-1 cursor-pointer items-center gap-3 overflow-hidden"
      >
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", iconClassName)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{title}</span>
            {isCurrent && (
              <Badge variant="outline" className="shrink-0 text-xs font-normal">
                Current
              </Badge>
            )}
          </span>
          <span className="block truncate text-sm text-muted-foreground">{subtitle}</span>
        </span>
      </Label>
    </div>
  );
}

function projectSubtitle(project: ApiProject): string {
  const count = project.workflowCount ?? 0;
  const workflows = `${count} workflow${count === 1 ? "" : "s"}`;
  return project.ownerType === "org"
    ? `${project.ownerName ?? "Organization"} · ${workflows}`
    : workflows;
}

export function MoveWorkflowDialog({
  open,
  onOpenChange,
  workflow,
  projects,
  onMove,
  isPending = false,
}: MoveWorkflowDialogProps) {
  const currentValue = workflow?.projectId ?? UNFILED;
  const [selected, setSelected] = useState<string>(currentValue);
  const [filter, setFilter] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const [isScrollable, setIsScrollable] = useState(false);

  // Reopening for a different workflow must not inherit the last one's choice.
  useEffect(() => {
    if (open) {
      setSelected(workflow?.projectId ?? UNFILED);
      setFilter("");
    }
  }, [open, workflow]);

  // Measured rather than guessed from a row count: rows vary in height, and a
  // fade shown over a list that does not scroll is a lie about the content.
  useLayoutEffect(() => {
    const node = listRef.current;
    setIsScrollable(node ? node.scrollHeight > node.clientHeight + 1 : false);
  });

  const needle = filter.trim().toLowerCase();
  const visibleProjects = useMemo(
    () => (needle === "" ? projects : projects.filter((p) => p.title.toLowerCase().includes(needle))),
    [needle, projects]
  );
  const unfiledMatches = needle === "" || "unfiled".includes(needle);
  const showFilter = projects.length > FILTER_THRESHOLD;

  const targetProject = selected === UNFILED ? null : projects.find((p) => p.id === selected) ?? null;
  const targetOwnerType = targetProject?.ownerType ?? "user";

  /**
   * Only surfaced when the move actually changes hands — a notice that fires on
   * every move is a notice nobody reads.
   */
  const ownershipNotice = useMemo(() => {
    if (!workflow || selected === currentValue) {
      return null;
    }
    if (targetOwnerType === "org" && targetProject) {
      const sameOrg = workflow.ownerType === "org" && workflow.ownerUuid === targetProject.ownerUuid;
      if (!sameOrg) {
        return `Everyone in ${targetProject.ownerName ?? "this organization"} will be able to see this workflow and its runs.`;
      }
      return null;
    }
    if (workflow.ownerType === "org") {
      return `This workflow will leave ${workflow.ownerName ?? "the organization"} and move to your account. Other members will lose access.`;
    }
    return null;
  }, [currentValue, selected, targetOwnerType, targetProject, workflow]);

  const handleMove = async () => {
    if (selected === currentValue) {
      return;
    }
    await onMove(selected === UNFILED ? null : selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Without this, focus lands on the filter input and its ring is the first
        thing the eye meets — pulling attention to a search box instead of to the
        destination list, which is the actual decision being made here.
      */}
      <DialogContent className="max-w-md" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Move workflow</DialogTitle>
          <DialogDescription>
            Choose where &quot;{workflow?.title}&quot; is filed. Its pages, steps, and runs move with it.
          </DialogDescription>
        </DialogHeader>

        {/*
          `min-w-0` is load-bearing at every level down to the truncating span.
          Grid and flex items default to `min-width: auto`, so a `truncate`
          (which implies `white-space: nowrap`) reports the full untruncated
          string as its minimum and silently widens the whole dialog past the
          viewport instead of ellipsing. Verified at 390px: the grid column sat
          at 401px inside a 390px dialog until these were added.
        */}
        <div className="min-w-0 space-y-4 py-2">
          {showFilter && (
            <div className="relative min-w-0">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search projects..."
                aria-label="Search projects"
                className="pl-9"
                data-testid="input-move-filter"
              />
            </div>
          )}

          {/*
            A clipped row at the fold reads as a rendering fault unless something
            says "there is more". The fade is that cue, and it is rendered only
            when the list genuinely overflows — a permanent one implies scroll on
            a list that has none.
          */}
          <div className="relative">
            <RadioGroup
              ref={listRef}
              value={selected}
              onValueChange={setSelected}
              // The base RadioGroup is already `grid gap-2`; adding space-y here
              // would stack a margin on top of that gap.
              className="max-h-[22rem] min-w-0 overflow-y-auto pr-1"
            >
            {unfiledMatches && (
              <DestinationRow
                value={UNFILED}
                title="Unfiled"
                subtitle="Kept on its own, outside any project"
                icon={FolderOpen}
                iconClassName="bg-muted text-muted-foreground"
                isCurrent={currentValue === UNFILED}
              />
            )}

            {visibleProjects.map((project) => (
              <DestinationRow
                key={project.id}
                value={project.id}
                title={project.title}
                subtitle={projectSubtitle(project)}
                icon={project.ownerType === "org" ? Users : Folder}
                iconClassName={
                  project.ownerType === "org"
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                    : "bg-secondary text-secondary-foreground"
                }
                isCurrent={currentValue === project.id}
              />
            ))}
            </RadioGroup>
            {isScrollable && (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent"
                aria-hidden="true"
              />
            )}
          </div>

          {projects.length === 0 && (
            <p className="text-sm text-muted-foreground">
              You have no projects yet. Create one from the New menu to group related workflows together.
            </p>
          )}

          {projects.length > 0 && visibleProjects.length === 0 && !unfiledMatches && (
            <p className="text-sm text-muted-foreground">No projects match &quot;{filter.trim()}&quot;.</p>
          )}

          {ownershipNotice && (
            <div
              className="flex items-start space-x-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950"
              data-testid="text-move-ownership-notice"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="mb-1 font-medium">Ownership changes</p>
                <p>{ownershipNotice}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => { void handleMove(); }}
            disabled={isPending || selected === currentValue}
            data-testid="button-confirm-move"
          >
            <Move className="mr-2 h-4 w-4" aria-hidden="true" />
            {isPending ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
