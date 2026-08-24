import { cn } from "@/lib/utils";

import type { ApiPage, ApiSection } from "@/lib/vault-api";

/**
 * The runner's read-only Section rail (SECT-8B).
 *
 * Three states, never two (D-6):
 *
 * | State                     | Source                                    | Rendering            |
 * |---------------------------|-------------------------------------------|----------------------|
 * | excluded by `visibleIf`   | not in `visiblePages`                     | absent entirely      |
 * | visible, not yet reached  | in `visiblePages`, not in the reached set | greyed, `aria-disabled` |
 * | reached                   | in the reached set                        | normal               |
 *
 * A page logic removed from this run is *not advertised* — leaking a page
 * title the respondent's answers excluded is an information disclosure, not a
 * cosmetic bug. The caller therefore passes only the pages the visibility
 * engine already resolved as visible; this component never re-derives them.
 *
 * Reachedness likewise comes from the caller (the run row's `visitedPageIds`
 * in production, the preview shell's in-memory set in preview) — the one thing
 * this component adds is the display invariant that the page currently being
 * rendered counts as reached, because the respondent is demonstrably on it.
 *
 * This rail is deliberately inert: it renders state and does not navigate.
 * Clicking reached pages is SECT-9.
 */

export type RunnerNavPage = Pick<ApiPage, "id" | "title"> & { sectionId?: string | null };
export type RunnerNavSection = Pick<ApiSection, "id" | "title">;

export interface RunnerNavData {
  /** Sections of the run's pinned definition, used only to label groups. */
  sections: RunnerNavSection[];
  /** Pages the visibility engine resolved as visible, in `order` position. */
  visiblePages: RunnerNavPage[];
  /** Insertion-ordered reached set, owned by the server (SECT-8A). */
  visitedPageIds: string[];
  currentPageId?: string | null;
}

type RunnerNavPageState = "current" | "reached" | "unreached";

interface RunnerNavItem {
  page: RunnerNavPage;
  state: RunnerNavPageState;
}

export interface RunnerNavGroup {
  /** React key; a Section can legally hold only one contiguous span (D-2). */
  key: string;
  /** `null` for ungrouped pages, which render at the top level (D-3). */
  section: RunnerNavSection | null;
  items: RunnerNavItem[];
  reachedCount: number;
}

const PAGES_REACHED_SUFFIX = " pages reached";

// `--primary` in this design system is a complete `hsl(...)` string, not the
// channel triple Tailwind's `/opacity` modifier compiles against, so
// `bg-primary/10` silently resolves to transparent. The selected row therefore
// uses the solid `accent` token — the system's own subtle-fill colour, and
// theme-aware — while brand presence comes from the solid spine and node.
const ROW_CLASS: Record<RunnerNavPageState, string> = {
  current: "bg-accent font-medium text-foreground",
  reached: "text-foreground",
  unreached: "text-muted-foreground",
};

const NODE_CLASS: Record<RunnerNavPageState, string> = {
  current: "border-primary bg-primary ring-4 ring-accent",
  reached: "border-primary bg-primary",
  unreached: "border-muted-foreground/40 bg-background",
};

const STATE_LABEL: Record<RunnerNavPageState, string> = {
  current: "current page",
  reached: "reached",
  unreached: "not yet reached",
};

function resolvePageState(
  page: RunnerNavPage,
  reached: Set<string>,
  currentPageId: string | null | undefined
): RunnerNavPageState {
  if (currentPageId != null && page.id === currentPageId) {
    return "current";
  }
  return reached.has(page.id) ? "reached" : "unreached";
}

/**
 * Group the visible pages into the contiguous spans a Section is defined as
 * (D-2). A Section whose pages were all excluded by logic never appears here,
 * because it contributes no visible page to walk over.
 */
export function buildRunnerNavGroups(data: RunnerNavData): RunnerNavGroup[] {
  const reached = new Set(data.visitedPageIds);
  const sectionsById = new Map(data.sections.map((section) => [section.id, section]));
  const groups: RunnerNavGroup[] = [];

  for (const page of data.visiblePages) {
    // An unknown section id degrades to top level rather than to a blank label.
    const section = page.sectionId != null ? sectionsById.get(page.sectionId) ?? null : null;
    const sectionId = section?.id ?? null;
    const item: RunnerNavItem = {
      page,
      state: resolvePageState(page, reached, data.currentPageId),
    };

    const last: RunnerNavGroup | undefined = groups[groups.length - 1];
    if (last != null && (last.section?.id ?? null) === sectionId) {
      last.items.push(item);
    } else {
      groups.push({
        key: `${sectionId ?? "ungrouped"}-${groups.length}`,
        section,
        items: [item],
        reachedCount: 0,
      });
    }
  }

  for (const group of groups) {
    group.reachedCount = group.items.filter((item) => item.state !== "unreached").length;
  }

  return groups;
}

function ReachedCount({ reached, total }: { reached: number; total: number }) {
  return (
    <span className="shrink-0 tabular-nums text-[11px] font-medium text-muted-foreground">
      {reached}/{total}
      <span className="sr-only">{PAGES_REACHED_SUFFIX}</span>
    </span>
  );
}

function SectionHeader({ group }: { group: RunnerNavGroup }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1 pb-2 pt-5">
      <span className="text-[13px] font-semibold leading-snug text-foreground">{group.section?.title}</span>
      <ReachedCount reached={group.reachedCount} total={group.items.length} />
    </div>
  );
}

function NavPageRow({ item }: { item: RunnerNavItem }) {
  return (
    <li
      aria-current={item.state === "current" ? "step" : undefined}
      aria-disabled={item.state === "unreached" ? true : undefined}
      className="relative"
    >
      <span
        aria-hidden="true"
        className={cn("absolute left-[-4px] top-[10px] h-2.5 w-2.5 rounded-full border", NODE_CLASS[item.state])}
      />
      {/* The tint starts clear of the spine so it never paints over the thread. */}
      <div
        className={cn(
          "ml-4 rounded-md px-2 py-1.5 transition-colors motion-reduce:transition-none",
          ROW_CLASS[item.state]
        )}
      >
        <span className="block text-[13px] leading-snug">{item.page.title}</span>
        <span className="sr-only">{STATE_LABEL[item.state]}</span>
      </div>
    </li>
  );
}

/**
 * The spine: one thread running down the group, filled as far as the
 * respondent has reached. It carries the progress a separate meter bar used
 * to, which read as an underline on the Section title rather than as data.
 *
 * It is a position indicator, never a completion claim — entering a page does
 * not prove its validation was submitted (AC5).
 */
function NavGroupList({ group, withSpine }: { group: RunnerNavGroup; withSpine: boolean }) {
  const fraction = group.items.length === 0 ? 0 : group.reachedCount / group.items.length;

  return (
    <ul className={cn("relative ml-[7px]", withSpine ? undefined : "mt-5")}>
      {withSpine && (
        <>
          <span aria-hidden="true" className="absolute bottom-1 left-0 top-1 w-[2px] rounded-full bg-border" />
          <span
            aria-hidden="true"
            className="absolute left-0 top-1 w-[2px] rounded-full bg-primary transition-[height] duration-300 motion-reduce:transition-none"
            style={{ height: `calc((100% - 0.5rem) * ${fraction})` }}
          />
        </>
      )}
      {group.items.map((item) => (
        <NavPageRow key={item.page.id} item={item} />
      ))}
    </ul>
  );
}

export interface RunnerSectionNavProps {
  data: RunnerNavData;
  className?: string;
}

export function RunnerSectionNav({ data, className }: RunnerSectionNavProps) {
  const groups = buildRunnerNavGroups(data);
  const totalPages = data.visiblePages.length;

  if (totalPages === 0) {
    return null;
  }

  const reachedTotal = groups.reduce((sum, group) => sum + group.reachedCount, 0);

  return (
    <nav aria-label="Interview contents" className={cn("flex flex-col", className)}>
      <div className="flex items-baseline justify-between gap-2 border-b border-border px-1 pb-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Contents
        </span>
        <ReachedCount reached={reachedTotal} total={totalPages} />
      </div>

      {groups.map((group) => (
        <div key={group.key}>
          {group.section && <SectionHeader group={group} />}
          {/* An ungrouped page gets no spine: a lone 2px stub reads as a
              fragment of the Section above it rather than a top-level page (D-3). */}
          <NavGroupList group={group} withSpine={group.section != null} />
        </div>
      ))}
    </nav>
  );
}
