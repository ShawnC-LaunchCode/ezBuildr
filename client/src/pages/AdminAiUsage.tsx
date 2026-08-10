import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Coins,
  Cpu,
  Info,
  Layers3,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

/**
 * Row shape returned by `AiUsageRepository.getUsageBreakdownSince` and served
 * by `GET /api/admin/ai-settings/usage` (AISL-10).
 */
interface AiUsageRow {
  taskType: string | null;
  provider: string;
  model: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  meanCostUsd: number;
}

interface AiUsageResponse {
  success: boolean;
  usage: AiUsageRow[];
}

const WINDOWS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

/**
 * AI spend is routinely sub-cent per call, so a plain currency format collapses
 * every interesting row to "$0.00". Scale the precision to the magnitude.
 */
function formatUsd(value: number): string {
  if (value === 0) {return "$0";}
  if (value < 0.01) {return `$${value.toFixed(4)}`;}
  if (value < 1) {return `$${value.toFixed(3)}`;}
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) {return `${(value / 1_000_000).toFixed(1)}M`;}
  if (value >= 1_000) {return `${(value / 1_000).toFixed(1)}K`;}
  return value.toLocaleString();
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

/** `workflow_generation` → `Workflow generation`. */
function humanizeTaskType(taskType: string | null): string {
  if (taskType === null || taskType === "") {return "Unattributed";}
  const spaced = taskType.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function AdminAiUsage() {
  const { user } = useAuth();
  const [days, setDays] = useState<string>("30");

  // An explicit queryFn is required here: the default one joins the queryKey
  // with "/", which would request `/usage/30` as a path segment rather than
  // `?days=30`.
  const { data, isLoading, isError } = useQuery<AiUsageResponse>({
    queryKey: ["/api/admin/ai-settings/usage", days],
    enabled: user?.role === "admin",
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/ai-settings/usage?days=${days}`,
      );
      return (await res.json()) as AiUsageResponse;
    },
  });

  const rows = useMemo(() => {
    const usage = data?.usage ?? [];
    // Cost-descending is the whole point of the page: the first row should be
    // the thing worth acting on.
    return [...usage].sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  }, [data]);

  const totals = useMemo(() => {
    const totalCost = rows.reduce((sum, r) => sum + r.totalCostUsd, 0);
    const totalCalls = rows.reduce((sum, r) => sum + r.count, 0);
    const totalTokens = rows.reduce(
      (sum, r) => sum + r.inputTokens + r.outputTokens,
      0,
    );
    // rows is already cost-descending, so the head is the most expensive.
    const top = rows[0] ?? null;
    return {
      totalCost,
      totalCalls,
      totalTokens,
      meanCost: totalCalls === 0 ? 0 : totalCost / totalCalls,
      top,
      topShare:
        top === null || totalCost === 0
          ? 0
          : (top.totalCostUsd / totalCost) * 100,
    };
  }, [rows]);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <Header
          title="AI Usage"
          description="What each AI operation costs, across every tenant"
        />

        <div className="flex-1 overflow-auto bg-muted/20 p-4 sm:p-6">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Recorded per call by the governed AI client. Rolling window.
              </p>
              <Tabs value={days} onValueChange={setDays}>
                <TabsList>
                  {WINDOWS.map((w) => (
                    <TabsTrigger key={w.value} value={w.value}>
                      {w.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {isLoading ? (
              <LoadingState />
            ) : isError ? (
              <ErrorState />
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    title="Total spend"
                    value={formatUsd(totals.totalCost)}
                    detail={`over the last ${days} days`}
                    icon={Coins}
                    accentClass="bg-emerald-100 text-emerald-700"
                  />
                  {/* The page's actual question is "what is expensive?" — answer
                      it in a card rather than making the reader scan the table.
                      A blended mean across a $5 generation and a $0.0005
                      sentiment call would look precise and mean nothing. */}
                  <MetricCard
                    title="Most expensive"
                    value={
                      totals.top === null
                        ? "—"
                        : humanizeTaskType(totals.top.taskType)
                    }
                    detail={
                      totals.top === null
                        ? "no usage recorded"
                        : `${formatUsd(totals.top.totalCostUsd)} — ${totals.topShare.toFixed(0)}% of spend`
                    }
                    icon={Receipt}
                    accentClass="bg-sky-100 text-sky-700"
                  />
                  <MetricCard
                    title="Calls"
                    value={formatCount(totals.totalCalls)}
                    detail={
                      totals.totalCalls === 0
                        ? "no calls in this window"
                        : `${formatUsd(totals.meanCost)} average across all operations`
                    }
                    icon={Layers3}
                    accentClass="bg-amber-100 text-amber-700"
                  />
                  <MetricCard
                    title="Tokens"
                    value={formatTokens(totals.totalTokens)}
                    detail="input + output combined"
                    icon={Cpu}
                    accentClass="bg-violet-100 text-violet-700"
                  />
                </div>

                <Card className="border-border/70 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      Cost by operation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {rows.length === 0 ? (
                      <EmptyState days={days} />
                    ) : (
                      <UsageTable rows={rows} totalCost={totals.totalCost} />
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function UsageTable({
  rows,
  totalCost,
}: {
  rows: AiUsageRow[];
  totalCost: number;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px]">Operation</TableHead>
            <TableHead className="min-w-[160px]">Provider / model</TableHead>
            <TableHead className="text-right">Calls</TableHead>
            <TableHead className="text-right">In</TableHead>
            <TableHead className="text-right">Out</TableHead>
            <TableHead className="text-right">Mean / call</TableHead>
            <TableHead className="min-w-[160px] text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const share =
              totalCost === 0 ? 0 : (row.totalCostUsd / totalCost) * 100;
            return (
              <TableRow
                key={`${row.taskType ?? "none"}:${row.provider}:${row.model}`}
              >
                <TableCell className="font-medium text-foreground">
                  {humanizeTaskType(row.taskType)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant="secondary" className="w-fit font-normal">
                      {row.provider}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.model}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(row.count)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatTokens(row.inputTokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatTokens(row.outputTokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUsd(row.meanCostUsd)}
                </TableCell>
                <TableCell className="text-right">
                  {/* The share bar is the point of the page — it turns a list of
                      numbers into "this one is the problem" at a glance. */}
                  <div className="flex items-center justify-end gap-2">
                    <div
                      className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block"
                      role="presentation"
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(share, 1)}%` }}
                      />
                    </div>
                    <span className="min-w-[70px] font-semibold tabular-nums text-foreground">
                      {formatUsd(row.totalCostUsd)}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon,
  accentClass,
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  accentClass: string;
}) {
  const Icon = icon;

  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
              {value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${accentClass}`}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * An empty table here is genuinely ambiguous — it can mean "no AI traffic" or
 * "you are looking at a window with none". It can also mean the operation you
 * expected is deterministic and correctly writes no row at all, which has
 * surprised people before. Say so, rather than showing a blank box.
 */
function EmptyState({ days }: { days: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <Info className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          No AI usage in the last {days} days
        </p>
        <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground">
          Every model call is recorded here automatically. Some AI endpoints are
          deterministic and never call a model — transform debug and auto-fix,
          and document text extraction — so they correctly produce no rows.
        </p>
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <Card className="border-destructive/40 shadow-sm">
      <CardContent className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">
          Could not load AI usage
        </p>
        <p className="text-xs text-muted-foreground">
          The usage endpoint is admin-only. If this persists, check the server
          logs for <span className="font-mono">ai-settings/usage</span>.
        </p>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-10 w-10 rounded-md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/70 shadow-sm">
        <CardContent className="space-y-3 p-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
