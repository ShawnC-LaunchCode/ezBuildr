/**
 * Sortable list view for projects and workflows.
 *
 * The card grid and this table render the same entities from the same action
 * builders (`components/dashboard/assetActions.ts`), so switching view never
 * changes what you can do — only how densely it is shown.
 */

import { ArrowDown, ArrowUp, ChevronsUpDown, Folder, FileText, MoreVertical, Users } from "lucide-react";
import { Link, useLocation } from "wouter";

import { StatusBadge } from "@/components/shared/StatusBadge";
import type { EntityAction } from "@/components/shared/EntityCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AssetSort, SortDirection } from "@/hooks/useAssetBrowser";
import { cn } from "@/lib/utils";

export type AssetKind = "project" | "workflow";

export type AssetSortKey =
  | "title"
  | "kind"
  | "status"
  | "workflowCount"
  | "owner"
  | "updatedAt"
  | "createdAt";

/** One row, normalized so projects and workflows can share a table. */
export interface AssetRow {
  id: string;
  kind: AssetKind;
  title: string;
  description?: string | null;
  /** Where clicking the row navigates. */
  href: string;
  status?: string | null;
  /** Projects only; `undefined` on workflow rows. */
  workflowCount?: number;
  ownerLabel: string;
  /** True when the entity belongs to an organization rather than the viewer. */
  isOrgOwned?: boolean;
  updatedAt?: string | null;
  createdAt?: string | null;
  actions: EntityAction[];
}

interface AssetTableProps {
  rows: AssetRow[];
  sort: AssetSort;
  onSortChange: (key: AssetSortKey) => void;
  /** Show the Type column — only useful when the table mixes projects and workflows. */
  showKind?: boolean;
  /** Show the Workflows count column — only useful when projects are present. */
  showWorkflowCount?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
}

const SORT_ICONS: Record<SortDirection, typeof ArrowUp> = { asc: ArrowUp, desc: ArrowDown };

interface SortableHeadProps {
  label: string;
  sortKey: AssetSortKey;
  sort: AssetSort;
  onSortChange: (key: AssetSortKey) => void;
  align?: "left" | "right";
  className?: string;
}

function SortableHead({ label, sortKey, sort, onSortChange, align = "left", className }: SortableHeadProps) {
  const isActive = sort.key === sortKey;
  const Icon = isActive ? SORT_ICONS[sort.direction] : ChevronsUpDown;

  return (
    <TableHead
      className={cn("h-10 whitespace-nowrap", align === "right" && "text-right", className)}
      // Screen readers announce the current sort from the header itself, which is
      // the only cue a non-sighted user gets that the order changed.
      aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSortChange(sortKey)}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-sm py-1 font-medium transition-colors",
          "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
        data-testid={`button-sort-${sortKey}`}
      >
        {label}
        <Icon
          className={cn(
            "h-3.5 w-3.5 transition-opacity",
            isActive ? "opacity-100" : "opacity-40 group-hover:opacity-70"
          )}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );
}

function RowActions({ row }: { row: AssetRow }) {
  if (row.actions.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Actions for ${row.title}`}
          data-testid={`button-row-actions-${row.id}`}
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {row.actions.map((action, index) => {
          const ActionIcon = action.icon;
          const content = (
            <>
              {ActionIcon && <ActionIcon className="mr-2 h-4 w-4" aria-hidden="true" />}
              <span>{action.label}</span>
              {action.disabledReason !== undefined && (
                <span className="ml-3 text-[11px] text-muted-foreground">{action.disabledReason}</span>
              )}
            </>
          );

          return (
            <div key={index}>
              {action.separator === true && index > 0 && <DropdownMenuSeparator />}
              {action.href !== undefined && action.disabled !== true ? (
                <DropdownMenuItem asChild>
                  <Link href={action.href}>{content}</Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className={action.variant === "destructive" ? "text-destructive" : ""}
                  disabled={action.disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (action.disabled !== true) {
                      action.onClick?.(row);
                    }
                  }}
                >
                  {content}
                </DropdownMenuItem>
              )}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatDate(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
}

export function AssetTable({
  rows,
  sort,
  onSortChange,
  showKind = true,
  showWorkflowCount = true,
  emptyState,
  className,
}: AssetTableProps) {
  const [, setLocation] = useLocation();

  if (rows.length === 0 && emptyState !== undefined) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead label="Name" sortKey="title" sort={sort} onSortChange={onSortChange} />
            {showKind && (
              <SortableHead label="Type" sortKey="kind" sort={sort} onSortChange={onSortChange} className="hidden sm:table-cell" />
            )}
            <SortableHead label="Status" sortKey="status" sort={sort} onSortChange={onSortChange} className="hidden md:table-cell" />
            {showWorkflowCount && (
              <SortableHead
                label="Workflows"
                sortKey="workflowCount"
                sort={sort}
                onSortChange={onSortChange}
                align="right"
                className="hidden lg:table-cell"
              />
            )}
            <SortableHead label="Owner" sortKey="owner" sort={sort} onSortChange={onSortChange} className="hidden lg:table-cell" />
            <SortableHead label="Updated" sortKey="updatedAt" sort={sort} onSortChange={onSortChange} align="right" className="hidden md:table-cell" />
            <TableHead className="h-10 w-10 pl-0 pr-2">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const RowIcon = row.kind === "project" ? Folder : FileText;
            return (
              <TableRow
                key={row.id}
                className="cursor-pointer [&>td]:py-2.5"
                onClick={() => setLocation(row.href)}
                data-testid={`row-asset-${row.id}`}
              >
                <TableCell className="max-w-0 sm:max-w-[320px]">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 shrink-0 rounded-md p-1.5",
                        row.kind === "project" ? "bg-primary/10 text-primary" : "bg-secondary/50 text-secondary-foreground"
                      )}
                    >
                      <RowIcon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{row.title}</p>
                      {row.description !== null && row.description !== undefined && row.description !== "" && (
                        <p className="truncate text-xs text-muted-foreground">{row.description}</p>
                      )}
                      {/* The meta columns are all hidden below md; without this the
                          row would collapse to a bare name on a phone. */}
                      <div className="mt-1 flex items-center gap-2 md:hidden">
                        {row.status !== null && row.status !== undefined && row.status !== "" && (
                          <StatusBadge status={row.status} showIcon={false} className="px-1.5 text-[10px]" />
                        )}
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {formatDate(row.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </TableCell>

                {showKind && (
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className="font-normal capitalize">
                      {row.kind}
                    </Badge>
                  </TableCell>
                )}

                <TableCell className="hidden md:table-cell">
                  {row.status !== null && row.status !== undefined && row.status !== ""
                    ? <StatusBadge status={row.status} />
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>

                {showWorkflowCount && (
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">
                    {row.workflowCount ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                )}

                <TableCell className="hidden lg:table-cell">
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    {row.isOrgOwned === true && <Users className="h-3.5 w-3.5" aria-hidden="true" />}
                    {row.ownerLabel}
                  </span>
                </TableCell>

                <TableCell className="hidden text-right text-sm text-muted-foreground tabular-nums md:table-cell">
                  {formatDate(row.updatedAt)}
                </TableCell>

                <TableCell className="w-10 pl-0 pr-2 text-right">
                  <RowActions row={row} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
