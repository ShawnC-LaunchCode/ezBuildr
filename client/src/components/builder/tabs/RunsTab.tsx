/**
 * RunsTab — every live run of this workflow, and the documents each produced.
 *
 * Until this existed a creator had no way back to a finished run's documents:
 * only the respondent saw them, on the runner's final page (2026-09-14).
 * Preview runs never appear — listRuns returns executionMode 'live' only.
 */
import { AlertCircle, ChevronDown, ChevronRight, Download, FileText, History } from "lucide-react";
import { Fragment, useState, type ReactElement } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRunDocuments, useRuns } from "@/hooks/api/useRuns";
import { useToast } from "@/hooks/use-toast";
import { downloadRunDocument, type ApiRun } from "@/lib/vault-api";

import { BuilderLayout, BuilderLayoutContent, BuilderLayoutHeader } from "../layout/BuilderLayout";

type DocumentTone = "done" | "failed" | "pending" | "none";

interface DocumentState {
  label: string;
  tone: DocumentTone;
  /** The server's reason, for a failed generation. */
  reason?: string;
}

/** How a run's document generation reads in the table. */
export function documentState(run: Pick<ApiRun, "completed" | "generationStatus">): DocumentState {
  const status = run.generationStatus ?? null;
  if (status?.startsWith("failed:") === true) {
    return { label: "Failed", tone: "failed", reason: status.slice("failed:".length) };
  }
  if (status === "done") { return { label: "Done", tone: "done" }; }
  if (run.completed && (status === "pending" || status === "generating")) {
    return { label: "Generating…", tone: "pending" };
  }
  return { label: "—", tone: "none" };
}

const TONE_CLASS: Record<DocumentTone, string> = {
  done: "text-foreground",
  failed: "font-medium text-destructive",
  pending: "text-muted-foreground",
  none: "text-muted-foreground",
};

function RunStatusBadge({ completed, className = "" }: { completed: boolean; className?: string }): ReactElement {
  return (
    <Badge variant={completed ? "secondary" : "outline"} className={`whitespace-nowrap font-normal ${className}`}>
      {completed ? "Completed" : "In progress"}
    </Badge>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RunDocuments({ runId, failedReason }: { runId: string; failedReason?: string }): ReactElement {
  const { toast } = useToast();
  const { data, isLoading, error } = useRunDocuments(runId);
  const [downloading, setDownloading] = useState<string | null>(null);

  if (isLoading) {
    return <p className="py-2 text-sm text-muted-foreground">Loading documents…</p>;
  }
  if (error !== null) {
    return <p className="py-2 text-sm text-destructive">Couldn&apos;t load documents: {error.message}</p>;
  }

  const documents = data?.documents ?? [];
  if (documents.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        {failedReason !== undefined ? `No documents — ${failedReason}.` : "This run produced no documents."}
      </p>
    );
  }

  const handleDownload = async (fileName: string): Promise<void> => {
    setDownloading(fileName);
    try {
      await downloadRunDocument(runId, fileName);
    } catch (downloadError: unknown) {
      toast({
        title: "Download failed",
        description: downloadError instanceof Error ? downloadError.message : String(downloadError),
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <ul className="divide-y">
      {documents.map((doc) => (
        <li key={doc.id} className="flex items-center justify-between gap-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate text-sm">{doc.fileName}</span>
            {doc.fileSize != null && doc.fileSize > 0 && (
              <span className="shrink-0 text-xs text-muted-foreground">{formatSize(doc.fileSize)}</span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { void handleDownload(doc.fileName); }}
            disabled={downloading === doc.fileName}
            aria-label={`Download ${doc.fileName}`}
          >
            <Download className="h-4 w-4 sm:mr-1" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">
              {downloading === doc.fileName ? "Downloading…" : "Download"}
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

interface RunsTabProps {
  workflowId: string;
}

export function RunsTab({ workflowId }: RunsTabProps): ReactElement {
  const { data: runs, isLoading, error } = useRuns(workflowId);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  let body: ReactElement;
  if (isLoading) {
    body = (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading runs...</div>
      </div>
    );
  } else if (!runs || runs.length === 0) {
    body = (
      <div className="mx-auto flex max-w-sm flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
          <History className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">No runs yet</h3>
        <p className="text-sm text-muted-foreground">
          When someone fills out this workflow, the run appears here with the documents it produced.
        </p>
      </div>
    );
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Started</TableHead>
            {/* Below `sm` the status moves under the start time, so Started,
                Documents and the button fit a phone without scrolling. */}
            <TableHead className="hidden sm:table-cell">Status</TableHead>
            <TableHead>Documents</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => {
            const expanded = expandedRunId === run.id;
            const docs = documentState(run);
            return (
              <Fragment key={run.id}>
                <TableRow>
                  <TableCell>
                    <div className="whitespace-nowrap">
                      {new Date(run.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                    </div>
                    <RunStatusBadge completed={run.completed} className="mt-1 sm:hidden" />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <RunStatusBadge completed={run.completed} />
                  </TableCell>
                  <TableCell>
                    <span className={TONE_CLASS[docs.tone]} title={docs.reason}>{docs.label}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!run.completed}
                      aria-expanded={expanded}
                      aria-controls={`run-documents-${run.id}`}
                      onClick={() => setExpandedRunId(expanded ? null : run.id)}
                    >
                      {expanded
                        ? <ChevronDown className="h-3 w-3 sm:mr-1" aria-hidden="true" />
                        : <ChevronRight className="h-3 w-3 sm:mr-1" aria-hidden="true" />}
                      {/* Icon-only on phones so the row fits; the label stays
                          the button's accessible name at every width. */}
                      <span className="sr-only sm:not-sr-only">Documents</span>
                    </Button>
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow id={`run-documents-${run.id}`} className="hover:bg-transparent">
                    {/* max-w-0: a table sizes to its cells' unbroken content, so a
                        long file name would widen every column and push the
                        buttons off a phone screen. This makes the row fit the
                        table's width instead, and the name truncates. */}
                    <TableCell colSpan={4} className="max-w-0 bg-muted/30 px-6">
                      <RunDocuments runId={run.id} failedReason={docs.reason} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <BuilderLayout>
      <BuilderLayoutHeader>
        <div>
          <h2 className="text-lg font-semibold">Runs</h2>
          <p className="text-sm text-muted-foreground">
            Every time someone fills out this workflow. Open a finished run to download its documents.
          </p>
        </div>
      </BuilderLayoutHeader>

      <BuilderLayoutContent>
        {error !== null && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load runs: {error.message}</AlertDescription>
          </Alert>
        )}
        {body}
      </BuilderLayoutContent>
    </BuilderLayout>
  );
}
