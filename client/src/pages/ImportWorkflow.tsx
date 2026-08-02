import { ArrowLeft, CheckCircle2, FileUp, Link2Off, Loader2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

import {
  Callout,
  SectionHeading,
  WarningLine,
  type ManifestWarning,
} from "@/components/portability/disclosure";
import {
  ImportPreviewReport,
  type ImportPreviewData,
} from "@/components/portability/ImportPreviewReport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getAccessToken } from "@/lib/vault-api";
import { useProjects } from "@/lib/vault-hooks";

/**
 * Import a workflow bundle: choose a file, read what it will do, then apply
 * (IEX3-5).
 *
 * The two-step shape is the API's own — `/preview` exists precisely so a user
 * can see the consequences before committing, and until now nothing called it.
 * The whole preview payload was computed and thrown away.
 *
 * The single most important thing on this screen is `hasExecutableCode`. A
 * bundle can carry transform blocks and lifecycle hooks — arbitrary JS and
 * Python that will run inside the importing tenant. Nobody had ever been shown
 * that, so it leads.
 */

interface ApplyResult {
  rootId: string;
  scope: string;
  entityCounts: Record<string, number>;
  blobsRestored: number;
  warnings: ManifestWarning[];
}

async function postBundle<T>(
  path: string,
  file: File,
  fields: Record<string, string>
): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  for (const [k, v] of Object.entries(fields)) {
    body.append(k, v);
  }
  const token = getAccessToken();
  const response = await fetch(path, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    // Surface the server's own words — it distinguishes a corrupt archive from
    // an oversized one from a rejected file type, and a generic "upload
    // failed" would throw all three away.
    throw new Error(payload.message ?? `Upload rejected (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export default function ImportWorkflow(): JSX.Element {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: projects } = useProjects();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewData | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [targetProjectId, setTargetProjectId] = useState<string>("");
  const [name, setName] = useState<string>("");

  const previewRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Focus follows consequence: into the preview when it lands, onto the error
  // summary when the bundle cannot be applied at all (AC 7).
  useEffect(() => {
    if (preview === null) {
      return;
    }
    if (!preview.canProceed) {
      errorRef.current?.focus();
    } else {
      previewRef.current?.focus();
    }
  }, [preview]);

  const runPreview = useCallback(async (chosen: File) => {
    setIsPreviewing(true);
    setUploadError(null);
    setPreview(null);
    setApplied(null);
    try {
      const result = await postBundle<ImportPreviewData>(
        "/api/portability/import/preview",
        chosen,
        {}
      );
      setPreview(result);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not read that bundle");
    } finally {
      setIsPreviewing(false);
    }
  }, []);

  const handleFile = useCallback(
    (chosen: File | undefined) => {
      if (!chosen) {
        return;
      }
      setFile(chosen);
      void runPreview(chosen);
    },
    [runPreview]
  );

  const handleApply = useCallback(async () => {
    if (file === null) {
      return;
    }
    setIsApplying(true);
    try {
      // Only the fields the route's allowlist accepts — widening this is a
      // mass-assignment hole, see applyOptionsSchema.
      const fields: Record<string, string> = {};
      if (targetProjectId !== "") {
        fields.targetProjectId = targetProjectId;
      }
      if (name.trim() !== "") {
        fields.name = name.trim();
      }
      const result = await postBundle<ApplyResult>(
        "/api/portability/import/apply",
        file,
        fields
      );
      setApplied(result);
      toast({
        title: "Import complete",
        description: `Created ${result.entityCounts.workflows ?? 0} workflow(s).`,
      });
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  }, [file, targetProjectId, name, toast]);


  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/workflows")}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Workflows
        </Button>
        <h1 className="text-2xl font-semibold">Import a workflow</h1>
        <p className="text-sm text-muted-foreground">
          Bring in a <code className="text-xs">.ezb</code> bundle exported from ezBuildr. Nothing
          is created until you review what it contains and confirm.
        </p>
      </div>

      {applied === null && (
        <section className="space-y-3" aria-labelledby="import-choose">
          <SectionHeading>
            <span id="import-choose">Choose a bundle</span>
          </SectionHeading>
          <div className="flex items-center gap-3">
            <Label htmlFor="bundle-file" className="sr-only">
              Bundle file
            </Label>
            <Input
              id="bundle-file"
              type="file"
              accept=".ezb,application/zip"
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="max-w-md"
            />
            {isPreviewing && (
              <span className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Reading the bundle…
              </span>
            )}
          </div>
          {file !== null && !isPreviewing && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
              {file.name}
            </p>
          )}
        </section>
      )}

      {uploadError !== null && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {uploadError}
        </div>
      )}

      {applied !== null && (
        <section className="space-y-4" aria-labelledby="import-done">
          <Callout
            tone="muted"
            icon={CheckCircle2}
            labelId="import-done"
            title="Import complete"
          >
            <p className="text-sm text-muted-foreground">
              Everything in the bundle was created in this workspace.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => navigate(`/workflows/${applied.rootId}/builder`)}>
                Open the imported workflow
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/workflows")}>
                Back to workflows
              </Button>
            </div>
          </Callout>

          {/* Carried onto this screen deliberately: a warning shown only on the
              page the user immediately navigates away from is not shown. */}
          {applied.warnings.length > 0 && (
            <Callout
              tone="warn"
              icon={Link2Off}
              labelId="import-done-warnings"
              title={`${applied.warnings.length} reference${applied.warnings.length === 1 ? "" : "s"} could not be resolved`}
            >
              <p className="text-sm text-muted-foreground">
                These pointed at things that were not in the bundle. Re-point them in the builder.
              </p>
              <ul className="space-y-1">
                {applied.warnings.map((w, i) => (
                  <li key={i}>
                    <WarningLine warning={w} />
                  </li>
                ))}
              </ul>
            </Callout>
          )}
        </section>
      )}

      {preview !== null && applied === null && (
        <div ref={previewRef} tabIndex={-1} className="space-y-6 outline-none">
          <ImportPreviewReport errorRef={errorRef} preview={preview} />

          <section className="space-y-3" aria-labelledby="import-target">
            <SectionHeading>
              <span id="import-target">Where it lands</span>
            </SectionHeading>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="target-project">Project</Label>
                <Select value={targetProjectId} onValueChange={setTargetProjectId}>
                  <SelectTrigger id="target-project">
                    <SelectValue placeholder="Keep the bundle's own project" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects ?? []).map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="import-name">Rename (optional)</Label>
                <Input
                  id="import-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Leave blank to keep the original name"
                  maxLength={255}
                />
              </div>
            </div>
          </section>

          <div className="flex items-center gap-2 border-t pt-4">
            <Button onClick={() => void handleApply()} disabled={!preview.canProceed || isApplying}>
              {isApplying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Import this workflow
            </Button>
            <Button variant="outline" onClick={() => navigate("/workflows")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
