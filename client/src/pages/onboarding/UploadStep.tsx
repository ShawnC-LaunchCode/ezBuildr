import { FileUp, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { analyzeDocument, suggestAliases } from "./onboardingApi";
import { defaultStepSelectionFor, toCamelCaseAlias, toHumanLabel } from "./stepTypeOptions";

import type { OnboardingVariable } from "./onboardingTypes";

export interface UploadStepProps {
  onExtracted: (variables: OnboardingVariable[], file: File) => void;
}

/**
 * Step 1+2 of the onboarding wizard: upload a document and let AI extract
 * its variables (`POST /api/ai/doc/analyze`), seeding each row's alias from
 * `/api/ai/doc/suggest-improvements` before handing off to Review & Approve.
 *
 * Error mapping follows `ImportWorkflow.tsx`'s pattern (AC4): surface the
 * server's own rejection message in an inline alert rather than a generic
 * failure, so oversized/wrong-type/malicious uploads are distinguishable.
 */
export function UploadStep({ onExtracted }: UploadStepProps): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (chosen: File | undefined) => {
      if (!chosen) {
        return;
      }
      setFile(chosen);
      setUploadError(null);
      setIsAnalyzing(true);
      try {
        const result = await analyzeDocument(chosen);
        if (result.variables.length === 0) {
          setUploadError(
            "No variables were found in that document. Try one with {{placeholders}} or form-like labels."
          );
          return;
        }
        const names = result.variables.map((v) => v.name);
        const aliasSuggestions = await suggestAliases(names);
        const reviewRows: OnboardingVariable[] = result.variables.map((v) => ({
          name: v.name,
          alias: aliasSuggestions[v.name] ?? toCamelCaseAlias(v.name),
          ...defaultStepSelectionFor(v.type),
          label: toHumanLabel(v.name),
          confidence: v.confidence,
          source: v.source,
        }));
        onExtracted(reviewRows, chosen);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Could not analyze that document");
      } finally {
        setIsAnalyzing(false);
      }
    },
    [onExtracted]
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Upload a document</h2>
        <p className="text-sm text-muted-foreground">
          Upload a DOCX, PDF, or text document. AI extracts the fields it finds and turns each one
          into a question you can review before anything is created.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Label htmlFor="onboarding-file" className="sr-only">
          Document
        </Label>
        <Input
          id="onboarding-file"
          type="file"
          accept=".docx,.pdf,.doc,.txt,.md"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
          }}
          className="max-w-md"
          disabled={isAnalyzing}
        />
        {isAnalyzing && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Extracting variables…
          </span>
        )}
      </div>

      {file !== null && !isAnalyzing && uploadError === null && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
          {file.name}
        </p>
      )}

      {uploadError !== null && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {uploadError}
        </div>
      )}
    </div>
  );
}
