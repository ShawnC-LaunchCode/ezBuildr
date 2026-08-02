import { AlertTriangle, ChevronRight, Download, KeyRound, Link2Off, Loader2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Callout,
  ReentryList,
  SectionHeading,
  WarningLine,
  type ManifestWarning,
  type RequiresReentryEntry,
} from "@/components/portability/disclosure";
import { getAccessToken } from "@/lib/vault-api";
import { EXCLUSION_CATEGORIES } from "@shared/types/portabilityDisclosure";

/**
 * Pre-download disclosure for a workflow bundle (IEX3-4).
 *
 * The engine already withholds every secret value and resets publish state on
 * import; none of that was visible to the person clicking download, because it
 * lived in `manifest.json` *inside* the zip. This dialog is where that becomes
 * a statement the user reads before deciding to share a file.
 *
 * Ordering is deliberate and is the design: anything requiring action —
 * a possible pasted credential, a secret that must be re-entered — sits above
 * the reassurance. A disclosure that opens with "you're fine" and buries the
 * warning is worse than no disclosure.
 */

interface ExportManifest {
  entityCounts: Record<string, number>;
  blobCount: number;
  warnings?: ManifestWarning[];
  requiresReentry?: RequiresReentryEntry[];
}

interface ExportWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  workflowTitle: string;
}

/** Entity table names → what a person calls them. */
const ENTITY_LABELS: Record<string, string> = {
  workflows: "Workflow",
  sections: "Pages",
  steps: "Questions",
  logic_rules: "Logic rules",
  blocks: "Blocks",
  transform_blocks: "Transform blocks",
  lifecycle_hooks: "Lifecycle hooks",
  document_hooks: "Document hooks",
  workflow_versions: "Versions",
  templates: "Document templates",
  template_versions: "Template versions",
  workflow_templates: "Template links",
  datavault_databases: "DataVault databases",
  datavault_tables: "DataVault tables",
  datavault_columns: "DataVault columns",
  datavault_rows: "DataVault rows",
  datavault_values: "DataVault values",
  datavault_number_sequences: "Number sequences",
  workflow_data_sources: "Data source links",
  workflow_queries: "Saved queries",
  datavault_writeback_mappings: "Writeback mappings",
  projects: "Project",
  secrets: "Secret names",
  connections: "Connections",
};

function labelFor(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity.replace(/_/g, " ");
}

/**
 * What the export could not carry (IEX3-10).
 *
 * `causes` are things — a shared DataVault the caller may not export, a blob
 * that went missing. `droppedRowCount` is the knock-on: rows dropped because
 * the thing they referenced stayed behind. Counted rather than recited, so the
 * disclosure names one problem instead of four and stays out of table names.
 */
function OmissionsCallout({
  causes,
  droppedRowCount,
}: {
  causes: ManifestWarning[];
  droppedRowCount: number;
}) {
  const many = causes.length !== 1;
  return (
    <Callout
      tone="warn"
      icon={Link2Off}
      labelId="export-omissions"
      title={
        many
          ? `${causes.length} things could not travel with this copy`
          : "One thing could not travel with this copy"
      }
    >
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {causes.map((w, i) => (
          <li key={i}>{w.message}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        The bundle is still valid — {many ? "these were" : "this was"} left out so it stays
        importable
        {droppedRowCount > 0 && (
          <>
            , along with {droppedRowCount} link{droppedRowCount === 1 ? "" : "s"} that pointed at{" "}
            {many ? "them" : "it"}
          </>
        )}
        . You will need to re-create {many ? "them" : "it"} after importing.
      </p>
    </Callout>
  );
}

/** The counts, plus the blob count the entity map has no entry for. */
function ContentsSection({ manifest }: { manifest: ExportManifest }) {
  const counts = Object.entries(manifest.entityCounts).filter(([, n]) => n > 0);
  return (
    <section className="space-y-2" aria-labelledby="export-included">
      <SectionHeading>
        <span id="export-included">What the file contains</span>
      </SectionHeading>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        {counts.map(([entity, count]) => (
          <div key={entity} className="flex items-baseline justify-between gap-2">
            <dt className="truncate text-muted-foreground">{labelFor(entity)}</dt>
            <dd className="font-mono tabular-nums">{count}</dd>
          </div>
        ))}
        {manifest.blobCount > 0 && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="truncate text-muted-foreground">Attached files</dt>
            <dd className="font-mono tabular-nums">{manifest.blobCount}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export function ExportWorkflowDialog({
  open,
  onOpenChange,
  workflowId,
  workflowTitle,
}: ExportWorkflowDialogProps) {
  const [manifest, setManifest] = useState<ExportManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();
  // Focus target on open, so a screen reader lands on the summary rather than
  // the close button (AC 6). Radix returns focus to the trigger on close.
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setManifest(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    const token = getAccessToken();

    void fetch(`/api/portability/export/workflow/${workflowId}/manifest`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message ?? `Could not read the export (${res.status})`);
        }
        return res.json() as Promise<ExportManifest>;
      })
      .then((data) => {
        if (!cancelled) {
          setManifest(data);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not read the export");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, workflowId]);

  // Radix parks focus on the dialog shell; move it onto the summary once there
  // is a summary to read, so the first thing announced is what the file
  // contains rather than the close button (AC 6). The ref was wired for this
  // from the start and nothing ever called focus() (IEX3-11).
  useEffect(() => {
    if (manifest !== null) {
      summaryRef.current?.focus();
    }
  }, [manifest]);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const token = getAccessToken();
      const response = await fetch(`/api/portability/export/workflow/${workflowId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error(`Export failed (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${workflowTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ezb`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  }, [workflowId, workflowTitle, onOpenChange, toast]);

  const secretScans = (manifest?.warnings ?? []).filter((w) => w.type === "secret_scan");
  // Everything the export decided it could not carry. The engine composes these
  // for a reader (IEX3-1) and this dialog used to filter them away, leaving the
  // one screen that claims to say what travels silent about what didn't
  // (IEX3-10).
  //
  // Split into causes and consequences, because printing them flat said "4
  // things" for what is really one thing and its knock-on effects, in table
  // names this disclosure is not supposed to use. The discriminator is the
  // engine's own shape: a *thing* that could not travel is reported against
  // `column: "id"` (collectWorkflowRefs), while a row dropped because its
  // target stayed behind is reported against the FK column that dangled
  // (processRow). Consequences are counted, not recited — the user acts on the
  // cause.
  const allOmissions = (manifest?.warnings ?? []).filter((w) => w.type !== "secret_scan");
  const omissions = allOmissions.filter((w) => w.type !== "dangling_reference" || w.column === "id");
  const droppedRowCount = allOmissions.length - omissions.length;
  const reentry = manifest?.requiresReentry ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" aria-describedby="export-disclosure-description">
        <DialogHeader>
          <DialogTitle>Download a copy of this workflow</DialogTitle>
          <DialogDescription id="export-disclosure-description">
            You will get a <code className="text-xs">.ezb</code> file containing the design of
            “{workflowTitle}” — its pages, questions, logic and templates. Review what travels
            with it before you share it.
          </DialogDescription>
        </DialogHeader>

        {loadError !== null && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {loadError}
          </div>
        )}

        {loadError === null && manifest === null && (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Checking what this export contains…
          </div>
        )}

        {manifest !== null && (
          <ScrollArea className="max-h-[26rem] pr-4">
            <div ref={summaryRef} tabIndex={-1} className="space-y-6 outline-none">
              {/* Action-required first. */}
              {secretScans.length > 0 && (
                <Callout
                  tone="warn"
                  icon={AlertTriangle}
                  labelId="export-secret-scan"
                  title={
                    secretScans.length === 1
                      ? "A possible credential was found in your code"
                      : `${secretScans.length} possible credentials were found in your code`
                  }
                >
                  <p className="text-sm text-muted-foreground">
                    These look like keys pasted into scripts, which the bundle carries as
                    written. Clean them up before sharing this file.
                  </p>
                  <ul className="space-y-1 text-sm">
                    {secretScans.map((w, i) => (
                      <li key={i}>
                        <WarningLine warning={w} />
                      </li>
                    ))}
                  </ul>
                </Callout>
              )}

              {omissions.length > 0 && (
                <OmissionsCallout causes={omissions} droppedRowCount={droppedRowCount} />
              )}

              {reentry.length > 0 && (
                <section className="space-y-2" aria-labelledby="export-reentry">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <SectionHeading>
                      <span id="export-reentry">Must be re-entered after importing</span>
                    </SectionHeading>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Secret values never leave this system. The bundle carries only their names.
                  </p>
                  <ReentryList entries={reentry} />
                </section>
              )}

              <ContentsSection manifest={manifest} />

              <Separator />

              {/* Collapsed by default. Six prose categories is reference
                  material; expanded, it pushed the decision-relevant facts —
                  the warning and the counts — out of view and read as a
                  truncated list. The promise stays visible either way. */}
              <Collapsible asChild>
                <section className="space-y-3" aria-labelledby="export-excluded">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <SectionHeading>
                      <span id="export-excluded">What stays behind</span>
                    </SectionHeading>
                  </div>
                  <CollapsibleTrigger className="group flex w-full items-start gap-2 rounded-md text-left text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <ChevronRight
                      className="mt-0.5 h-4 w-4 shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-90 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                    <span>
                      Responses, credentials, user accounts, billing and telemetry all stay in
                      this workspace — {EXCLUSION_CATEGORIES.length} categories in all.
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <dl className="grid gap-x-6 gap-y-3 pl-6 sm:grid-cols-2">
                      {EXCLUSION_CATEGORIES.map((category) => (
                        <div key={category.title} className="space-y-0.5">
                          <dt className="text-sm font-medium leading-snug">{category.title}</dt>
                          <dd className="text-xs leading-relaxed text-muted-foreground">
                            {category.summary}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </CollapsibleContent>
                </section>
              </Collapsible>
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleDownload()}
            disabled={manifest === null || isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Download .ezb
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
