import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpDown,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Database,
  FileText,
  FolderKanban,
  Gauge,
  HardDrive,
  Layers3,
  Search,
  Table2,
  type LucideIcon,
  Users,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type RunWindowKey = "last24h" | "last7d" | "last30d";
type SortKey = "runs30d" | "storage" | "workflows" | "projects" | "tables" | "name";

interface AdminOrgStatsItem {
  id: string;
  name: string;
  slug: string | null;
  domain: string | null;
  tenantId: string | null;
  tenantName: string | null;
  createdAt: string | null;
  members: {
    total: number;
    admins: number;
  };
  projects: {
    total: number;
    active: number;
    archived: number;
  };
  workflows: {
    total: number;
    active: number;
    draft: number;
    archived: number;
    public: number;
  };
  datavault: {
    databases: number;
    nativeDatabases: number;
    externalDatabases: number;
    tables: number;
    columns: number;
    rows: number;
    values: number;
  };
  templates: {
    total: number;
    versions: number;
  };
  storage: {
    totalBytes: number;
    datavaultBytes: number;
    generatedDocumentBytes: number;
    templateBytes: number;
    generatedDocumentCount: number;
  };
  runs: {
    total: number;
    completed: number;
    inProgress: number;
    last24h: number;
    last7d: number;
    last30d: number;
    completionRate: number;
    lastRunAt: string | null;
  };
}

interface AdminOrgStatsResponse {
  generatedAt: string;
  summary: {
    totalOrganizations: number;
    activeOrganizations: number;
    totalProjects: number;
    totalWorkflows: number;
    totalDatabases: number;
    totalTables: number;
    totalRows: number;
    totalStorageBytes: number;
    totalRuns: number;
    runsLast24h: number;
    runsLast7d: number;
    runsLast30d: number;
    busiestOrg: {
      id: string;
      name: string;
      runsLast30d: number;
    } | null;
  };
  organizations: AdminOrgStatsItem[];
}

const numberFormatter = new Intl.NumberFormat("en-US");

const runWindowLabels: Record<RunWindowKey, string> = {
  last24h: "24h",
  last7d: "7d",
  last30d: "30d",
};

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatDate(value: string | null): string {
  if (value === null) {
    return "No runs yet";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getRunWindowValue(org: AdminOrgStatsItem, windowKey: RunWindowKey): number {
  return org.runs[windowKey];
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
            <p className="mt-2 text-2xl font-semibold tracking-normal text-foreground">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${accentClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <Card key={item}>
            <CardContent className="p-5">
              <div className="h-20 animate-pulse rounded-md bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-5">
          <div className="h-96 animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    </div>
  );
}

function DetailStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  const Icon = icon;

  return (
    <div className="flex min-h-[76px] items-center gap-3 rounded-md border bg-background px-3 py-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function OrgDetailPanel({
  org,
  selectedWindow,
  totalStorageBytes,
}: {
  org: AdminOrgStatsItem;
  selectedWindow: RunWindowKey;
  totalStorageBytes: number;
}) {
  const storageShare = totalStorageBytes > 0
    ? Math.min(100, (org.storage.totalBytes / totalStorageBytes) * 100)
    : 0;

  return (
    <div className="space-y-4 rounded-md border bg-muted/20 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailStat
          label={`${runWindowLabels[selectedWindow]} runs`}
          value={formatNumber(getRunWindowValue(org, selectedWindow))}
          icon={Clock3}
        />
        <DetailStat
          label="Completion rate"
          value={`${org.runs.completionRate.toFixed(1)}%`}
          icon={Gauge}
        />
        <DetailStat
          label="Last run"
          value={formatDate(org.runs.lastRunAt)}
          icon={Activity}
        />
        <DetailStat
          label="Members"
          value={`${formatNumber(org.members.total)} total, ${formatNumber(org.members.admins)} admins`}
          icon={Users}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-md border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Run Windows</p>
              <p className="text-xs text-muted-foreground">Recent workflow traffic by org</p>
            </div>
            <Badge variant="secondary">{formatNumber(org.runs.total)} lifetime</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(runWindowLabels) as RunWindowKey[]).map((key) => (
              <div
                key={key}
                className={`rounded-md border p-3 ${selectedWindow === key ? "border-primary bg-primary/5" : "bg-muted/20"}`}
              >
                <p className="text-xs font-medium text-muted-foreground">{runWindowLabels[key]}</p>
                <p className="mt-1 text-xl font-semibold">{formatNumber(getRunWindowValue(org, key))}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatNumber(org.runs.completed)} completed</span>
              <span>{formatNumber(org.runs.inProgress)} in progress</span>
            </div>
            <Progress value={org.runs.completionRate} className="h-2" />
          </div>
        </div>

        <div className="rounded-md border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Storage</p>
              <p className="text-xs text-muted-foreground">DataVault, generated docs, templates</p>
            </div>
            <Badge variant="outline">{formatBytes(org.storage.totalBytes)}</Badge>
          </div>
          <Progress value={storageShare} className="h-2" />
          <div className="mt-3 grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">DataVault payload</span>
              <span className="font-medium">{formatBytes(org.storage.datavaultBytes)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Generated documents</span>
              <span className="font-medium">{formatBytes(org.storage.generatedDocumentBytes)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Templates</span>
              <span className="font-medium">{formatBytes(org.storage.templateBytes)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailStat
          label="DataVault"
          value={`${formatNumber(org.datavault.databases)} db, ${formatNumber(org.datavault.tables)} tables`}
          icon={Database}
        />
        <DetailStat
          label="Rows and columns"
          value={`${formatNumber(org.datavault.rows)} rows, ${formatNumber(org.datavault.columns)} columns`}
          icon={Table2}
        />
        <DetailStat
          label="Templates"
          value={`${formatNumber(org.templates.total)} files, ${formatNumber(org.templates.versions)} versions`}
          icon={FileText}
        />
        <DetailStat
          label="Generated docs"
          value={formatNumber(org.storage.generatedDocumentCount)}
          icon={Layers3}
        />
      </div>
    </div>
  );
}

function OrgStatsTable({
  organizations,
  expandedOrgId,
  selectedWindowByOrg,
  totalStorageBytes,
  onToggleOrg,
  onSelectRunWindow,
}: {
  organizations: AdminOrgStatsItem[];
  expandedOrgId: string | null;
  selectedWindowByOrg: Record<string, RunWindowKey>;
  totalStorageBytes: number;
  onToggleOrg: (orgId: string) => void;
  onSelectRunWindow: (orgId: string, windowKey: RunWindowKey) => void;
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-base">
          Organizations
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {formatNumber(organizations.length)} shown
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[28%] min-w-[260px]">Organization</TableHead>
              <TableHead className="min-w-[130px]">Projects</TableHead>
              <TableHead className="min-w-[150px]">Workflows</TableHead>
              <TableHead className="min-w-[170px]">DataVault</TableHead>
              <TableHead className="min-w-[140px]">Storage</TableHead>
              <TableHead className="min-w-[250px]">Runs</TableHead>
              <TableHead className="w-[56px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.map((org) => {
              const expanded = expandedOrgId === org.id;
              const selectedWindow = selectedWindowByOrg[org.id] ?? "last30d";

              return (
                <Fragment key={org.id}>
                  <TableRow className="bg-background">
                    <TableCell>
                      <div className="min-w-0 space-y-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-semibold">{org.name}</span>
                          {org.domain && <Badge variant="outline">{org.domain}</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {org.tenantName && <span>{org.tenantName}</span>}
                          {org.slug && <span>{org.slug}</span>}
                          <span>{formatNumber(org.members.total)} members</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">{formatNumber(org.projects.total)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(org.projects.active)} active
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">{formatNumber(org.workflows.total)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(org.workflows.active)} active, {formatNumber(org.workflows.draft)} draft
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">
                        {formatNumber(org.datavault.databases)} db / {formatNumber(org.datavault.tables)} tables
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(org.datavault.rows)} rows
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">{formatBytes(org.storage.totalBytes)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(org.storage.datavaultBytes)} DataVault
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(runWindowLabels) as RunWindowKey[]).map((windowKey) => (
                          <Button
                            key={windowKey}
                            type="button"
                            variant={selectedWindow === windowKey && expanded ? "default" : "outline"}
                            size="sm"
                            className="h-8 min-w-[74px]"
                            onClick={() => onSelectRunWindow(org.id, windowKey)}
                          >
                            {runWindowLabels[windowKey]}
                            <span className="ml-2 font-semibold">
                              {formatNumber(getRunWindowValue(org, windowKey))}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => onToggleOrg(org.id)}
                        aria-label={expanded ? "Collapse org" : "Expand org"}
                      >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow className="bg-background hover:bg-background">
                      <TableCell colSpan={7} className="p-4">
                        <OrgDetailPanel
                          org={org}
                          selectedWindow={selectedWindow}
                          totalStorageBytes={totalStorageBytes}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}

            {organizations.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  No organizations match the current search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function sortOrganizations(
  organizations: AdminOrgStatsItem[],
  sortKey: SortKey,
): AdminOrgStatsItem[] {
  return [...organizations].sort((a, b) => {
    switch (sortKey) {
      case "storage":
        return b.storage.totalBytes - a.storage.totalBytes;
      case "workflows":
        return b.workflows.total - a.workflows.total;
      case "projects":
        return b.projects.total - a.projects.total;
      case "tables":
        return b.datavault.tables - a.datavault.tables;
      case "name":
        return a.name.localeCompare(b.name);
      case "runs30d":
      default:
        return b.runs.last30d - a.runs.last30d;
    }
  });
}

function filterOrganizations(organizations: AdminOrgStatsItem[], search: string): AdminOrgStatsItem[] {
  const query = search.trim().toLowerCase();
  if (query.length === 0) {
    return organizations;
  }

  return organizations.filter((org) => {
    const searchable = [
      org.name,
      org.slug ?? "",
      org.domain ?? "",
      org.tenantName ?? "",
      org.tenantId ?? "",
    ].join(" ").toLowerCase();

    return searchable.includes(query);
  });
}

export default function AdminOrgStats() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("runs30d");
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [selectedWindowByOrg, setSelectedWindowByOrg] = useState<Record<string, RunWindowKey>>({});

  const { data, isLoading, error } = useQuery<AdminOrgStatsResponse>({
    queryKey: ["/api/admin/org-stats"],
    enabled: !!isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You must be logged in to access this page",
        variant: "destructive",
      });
      setTimeout(() => {
        setLocation("/");
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast, setLocation]);

  useEffect(() => {
    if (error) {
      toast({
        title: "Access Denied",
        description: "You must be an admin to access this page",
        variant: "destructive",
      });
      setTimeout(() => {
        setLocation("/");
      }, 1000);
    }
  }, [error, toast, setLocation]);

  const organizations = useMemo(() => {
    const filtered = filterOrganizations(data?.organizations ?? [], search);
    return sortOrganizations(filtered, sortKey);
  }, [data?.organizations, search, sortKey]);

  if (authLoading || !isAuthenticated || error) {
    return null;
  }

  const summary = data?.summary;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <Header
          title="Org Stats"
          description="Organization usage, storage, and workflow run volume"
        />

        <div className="flex-1 overflow-auto bg-muted/20 p-4 sm:p-6">
          {isLoading || summary === undefined ? (
            <LoadingState />
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Organizations"
                  value={formatNumber(summary.totalOrganizations)}
                  detail={`${formatNumber(summary.activeOrganizations)} with active assets`}
                  icon={Building2}
                  accentClass="bg-emerald-100 text-emerald-700"
                />
                <MetricCard
                  title="Projects and Workflows"
                  value={`${formatNumber(summary.totalProjects)} / ${formatNumber(summary.totalWorkflows)}`}
                  detail="Projects / workflows across orgs"
                  icon={FolderKanban}
                  accentClass="bg-blue-100 text-blue-700"
                />
                <MetricCard
                  title="DataVault Footprint"
                  value={`${formatNumber(summary.totalDatabases)} / ${formatNumber(summary.totalTables)}`}
                  detail={`${formatNumber(summary.totalRows)} rows stored`}
                  icon={Database}
                  accentClass="bg-amber-100 text-amber-700"
                />
                <MetricCard
                  title="Runs"
                  value={formatNumber(summary.totalRuns)}
                  detail={`${formatNumber(summary.runsLast30d)} in last 30 days`}
                  icon={BarChart3}
                  accentClass="bg-cyan-100 text-cyan-700"
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <Card className="border-border/70 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="relative w-full md:max-w-md">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search org, domain, tenant..."
                          className="pl-9"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {([
                          ["runs30d", "30d runs"],
                          ["storage", "Storage"],
                          ["workflows", "Workflows"],
                          ["projects", "Projects"],
                          ["tables", "Tables"],
                          ["name", "Name"],
                        ] as [SortKey, string][]).map(([key, label]) => (
                          <Button
                            key={key}
                            type="button"
                            variant={sortKey === key ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSortKey(key)}
                            className="h-9"
                          >
                            <ArrowUpDown className="mr-2 h-3.5 w-3.5" />
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Platform Storage</p>
                        <p className="mt-1 text-2xl font-semibold">{formatBytes(summary.totalStorageBytes)}</p>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                        <HardDrive className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      DataVault values, generated documents, and template sizes
                    </p>
                  </CardContent>
                </Card>
              </div>

              {summary.busiestOrg && (
                <div className="rounded-md border bg-background px-4 py-3 text-sm shadow-sm">
                  <span className="font-medium text-foreground">{summary.busiestOrg.name}</span>
                  <span className="text-muted-foreground"> has the most recent traffic with </span>
                  <span className="font-medium text-foreground">{formatNumber(summary.busiestOrg.runsLast30d)}</span>
                  <span className="text-muted-foreground"> runs in the last 30 days.</span>
                </div>
              )}

              <OrgStatsTable
                organizations={organizations}
                expandedOrgId={expandedOrgId}
                selectedWindowByOrg={selectedWindowByOrg}
                totalStorageBytes={summary.totalStorageBytes}
                onToggleOrg={(orgId) => setExpandedOrgId(expandedOrgId === orgId ? null : orgId)}
                onSelectRunWindow={(orgId, windowKey) => {
                  const selectedWindow = selectedWindowByOrg[orgId] ?? "last30d";
                  setSelectedWindowByOrg((prev) => ({ ...prev, [orgId]: windowKey }));
                  setExpandedOrgId(expandedOrgId === orgId && selectedWindow === windowKey ? null : orgId);
                }}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
