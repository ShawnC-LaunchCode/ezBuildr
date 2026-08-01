import { useQuery } from "@tanstack/react-query";
import { Download, Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getQueryFn } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";


interface ActivityLog {
  id: string;
  timestamp: string;
  event: string;
  actorId?: string | null;
  actorEmail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  status?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ActivityLogResult {
  rows: ActivityLog[];
  total: number;
}

type LogSortColumn = 'timestamp' | 'event' | 'actorEmail' | 'entityType' | 'ipAddress' | 'userAgent' | 'status';
type LogSortDirection = 'asc' | 'desc';
type LogSortOrder = `${LogSortColumn}_${LogSortDirection}`;

function isLogSortOrder(value: string): value is LogSortOrder {
  return /^(timestamp|event|actorEmail|entityType|ipAddress|userAgent|status)_(asc|desc)$/.test(value);
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function getStatusBadgeClass(status?: string | null): string {
  if (status === null || status === undefined || status === '') {
    return "bg-gray-100 text-gray-700";
  }
  switch (status.toLowerCase()) {
    case "error":
      return "bg-red-100 text-red-700";
    case "success":
      return "bg-green-100 text-green-700";
    case "warn":
    case "warning":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-blue-100 text-blue-700";
  }
}

function getMetadataActorEmail(log: ActivityLog): string | null {
  const metadataEmail = log.metadata?._actorEmail;
  if (typeof metadataEmail === "string" && metadataEmail !== "") {
    return metadataEmail;
  }
  return log.actorEmail ?? null;
}

function SortHeader({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
}: {
  column: LogSortColumn;
  label: string;
  sortColumn: string;
  sortDirection: string;
  onSort: (column: LogSortColumn) => void;
}) {
  const isActive = sortColumn === column;
  return (
    <th className="px-4 py-3 font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => onSort(column)}>
      <div className="flex items-center gap-1">
        {label}
        {isActive && (sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
      </div>
    </th>
  );
}

function ActorCell({ log }: { log: ActivityLog }) {
  const actorEmail = getMetadataActorEmail(log);
  if (actorEmail !== null) {
    return <span className="font-medium">{actorEmail}</span>;
  }
  if (log.actorId !== null && log.actorId !== undefined) {
    return <span className="text-muted-foreground text-xs font-mono">{log.actorId.substring(0, 8)}...</span>;
  }
  return <span className="text-muted-foreground italic">System</span>;
}

function EntityCell({ log }: { log: ActivityLog }) {
  if (log.entityType !== null && log.entityType !== undefined && log.entityId !== null && log.entityId !== undefined) {
    return <span className="text-xs">{log.entityType}:{log.entityId.substring(0, 8)}...</span>;
  }
  if (log.entityId !== null && log.entityId !== undefined) {
    return <span className="text-xs">{log.entityId.substring(0, 8)}...</span>;
  }
  return <span className="text-gray-400">-</span>;
}

function MetadataCell({ metadata }: { metadata?: Record<string, unknown> | null }) {
  if (metadata === null || metadata === undefined) {
    return <span className="text-gray-400">-</span>;
  }
  return (
    <details className="cursor-pointer">
      <summary className="text-xs text-blue-600 hover:text-blue-800">View JSON</summary>
      <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap break-words bg-gray-50 p-2 rounded">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </details>
  );
}

function LogRow({ log, onSelect }: { log: ActivityLog; onSelect: (log: ActivityLog) => void }) {
  return (
    <tr key={log.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => onSelect(log)}>
      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatTimestamp(log.timestamp)}</td>
      <td className="px-4 py-3 font-medium">{log.event}</td>
      <td className="px-4 py-3"><ActorCell log={log} /></td>
      <td className="px-4 py-3"><EntityCell log={log} /></td>
      <td className="px-4 py-3 whitespace-nowrap text-xs">{log.ipAddress ?? <span className="text-gray-400">-</span>}</td>
      <td className="px-4 py-3 max-w-xs truncate text-xs" title={log.userAgent ?? ''}>
        {log.userAgent ?? <span className="text-gray-400">-</span>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClass(log.status)}`}>
          {log.status ?? "info"}
        </span>
      </td>
      <td className="px-4 py-3 max-w-md"><MetadataCell metadata={log.metadata} /></td>
    </tr>
  );
}

function LogDetailsDialog({
  selectedLog,
  onClose,
}: {
  selectedLog: ActivityLog | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={selectedLog !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activity Log Details</DialogTitle>
        </DialogHeader>
        {selectedLog !== null && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold block text-gray-500">Event</span>
                {selectedLog.event}
              </div>
              <div>
                <span className="font-semibold block text-gray-500">Timestamp</span>
                {formatTimestamp(selectedLog.timestamp)}
              </div>
              <div>
                <span className="font-semibold block text-gray-500">Actor</span>
                {getMetadataActorEmail(selectedLog) ?? selectedLog.actorId ?? "System"}
              </div>
              <div>
                <span className="font-semibold block text-gray-500">Status</span>
                {selectedLog.status ?? "N/A"}
              </div>
              <div>
                <span className="font-semibold block text-gray-500">IP Address</span>
                {selectedLog.ipAddress ?? "N/A"}
              </div>
              <div className="break-words">
                <span className="font-semibold block text-gray-500">User Agent</span>
                {selectedLog.userAgent ?? "N/A"}
              </div>
            </div>
            <div>
              <span className="font-semibold block text-gray-500 mb-2 text-sm">Raw JSON</span>
              <pre className="bg-gray-50 p-4 rounded-md whitespace-pre-wrap break-all text-xs font-mono border max-h-[400px] overflow-y-auto">
                {JSON.stringify(selectedLog, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// eslint-disable-next-line max-lines-per-function
export default function AdminLogs() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [statusFilter, _setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortOrder, setSortOrder] = useState<LogSortOrder>("timestamp_desc");

  const handleSort = (column: LogSortColumn) => {
    setSortOrder((prev) => {
      const [prevCol, prevDir] = prev.split("_");
      if (prevCol === column) {
        return `${column}_${prevDir === "asc" ? "desc" : "asc"}`;
      }
      return `${column}_desc`;
    });
  };

  const sortColumn = sortOrder.split("_")[0];
  const sortDirection = sortOrder.split("_")[1];

  // Pagination state
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const limit = pageSize;

  // Build query params
  const queryParams = new URLSearchParams();
  if (searchQuery) {queryParams.set("q", searchQuery);}
  if (eventFilter) {queryParams.set("event", eventFilter);}
  if (actorFilter) {queryParams.set("actor", actorFilter);}
  if (statusFilter) {queryParams.set("status", statusFilter);}
  if (fromDate) {queryParams.set("from", fromDate);}
  if (toDate) {queryParams.set("to", toDate);}
  queryParams.set("sort", sortOrder);
  queryParams.set("limit", String(limit));
  queryParams.set("offset", String(page * limit));

  // Fetch logs
  const { data, isLoading, error } = useQuery<ActivityLogResult>({
    queryKey: [`/api/admin/logs?${queryParams.toString()}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!isAuthenticated,
    retry: false,
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You must be logged in to access this page",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  // Show error if access denied (not admin)
  useEffect(() => {
    if (error) {
      // Only show access denied for actual 403 errors
      const is403 = error instanceof Error && error.message.includes("403");
      if (is403) {
        toast({
          title: "Access Denied",
          description: "You must be an admin to access this page",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/";
        }, 1000);
      } else {
        // For other errors, just log them
        console.error("Error loading activity logs:", error);
      }
    }
  }, [error, toast]);

  // Reset to first page when filters or page size change
  useEffect(() => {
    setPage(0);
  }, [searchQuery, eventFilter, actorFilter, statusFilter, fromDate, toDate, sortOrder, pageSize]);

  if (authLoading || !isAuthenticated || error) {
    return null;
  }

  const logs = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  const handleExport = () => {
    const exportParams = new URLSearchParams();
    if (searchQuery) {exportParams.set("q", searchQuery);}
    if (eventFilter) {exportParams.set("event", eventFilter);}
    if (actorFilter) {exportParams.set("actor", actorFilter);}
    if (statusFilter) {exportParams.set("status", statusFilter);}
    if (fromDate) {exportParams.set("from", fromDate);}
    if (toDate) {exportParams.set("to", toDate);}
    exportParams.set("sort", sortOrder);

    window.location.href = `/api/admin/logs/export?${exportParams.toString()}`;
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        <Header
          title="Activity Logs"
          description="View and filter system activity events"
        />

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {/* Filters Section */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Search */}
                <div className="lg:col-span-2 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search events, actors..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Event Filter */}
                <Input
                  placeholder="Event type"
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                />

                {/* Actor Filter */}
                <Input
                  placeholder="Actor (email/ID)"
                  value={actorFilter}
                  onChange={(e) => setActorFilter(e.target.value)}
                />

                {/* Date From */}
                <Input
                  type="date"
                  placeholder="From date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />

                {/* Date To */}
                <Input
                  type="date"
                  placeholder="To date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions Bar */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {isLoading ? "Loading..." : `${total.toLocaleString()} events`}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="border rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="10">10 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
                <option value="1000">1000 per page</option>
              </select>
              <select
                value={sortOrder}
                onChange={(e) => {
                  if (isLogSortOrder(e.target.value)) {
                    setSortOrder(e.target.value);
                  }
                }}
                className="border rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="timestamp_desc">Newest first</option>
                <option value="timestamp_asc">Oldest first</option>
              </select>
              <Button onClick={handleExport} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Logs Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <table className="min-w-[1400px] w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-left">
                      <SortHeader column="timestamp" label="Time" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                      <SortHeader column="event" label="Event" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                      <SortHeader column="actorEmail" label="Actor Email" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                      <SortHeader column="entityType" label="Entity" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                      <SortHeader column="ipAddress" label="IP Address" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                      <SortHeader column="userAgent" label="User Agent" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                      <SortHeader column="status" label="Status" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                      <th className="px-4 py-3 font-medium text-gray-700">Metadata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <LogRow key={log.id} log={log} onSelect={setSelectedLog} />
                    ))}
                    {logs.length === 0 && !isLoading && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                          No activity logs found
                        </td>
                      </tr>
                    )}
                    {isLoading && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                          Loading...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total.toLocaleString()}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={!hasPrevPage}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!hasNextPage}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      <LogDetailsDialog selectedLog={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
