import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  Loader2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  type TemplateValidationReport,
  useTemplateValidation,
} from "@/hooks/api/useTemplateValidation";
import { queryKeys } from "@/hooks/api/queryKeys";
import { cn } from "@/lib/utils";

interface TemplateVariableHealthProps {
  templateId: string;
  templateType: "docx" | "pdf";
  templateVariables?: string[];
  workflowId: string;
  workflowVariableAliases: Set<string>;
}

interface MissingVariable {
  placeholder: string;
  raw?: string;
  suggestion?: string;
}

interface VariableHealthAnalysis {
  totalVariableCount: number;
  missing: MissingVariable[];
  unknownHelpers: string[];
  syntaxErrors: string[];
  unusedVariables: Array<{ alias: string; label: string }>;
  loopScoped: string[];
}

type ValidationReportWithCount = TemplateValidationReport & {
  totalVariableCount: number;
};

const EMPTY_ANALYSIS: VariableHealthAnalysis = {
  totalVariableCount: 0,
  missing: [],
  unknownHelpers: [],
  syntaxErrors: [],
  unusedVariables: [],
  loopScoped: [],
};

function getVariableHealth(
  templateType: "docx" | "pdf",
  report: TemplateValidationReport | undefined,
  templateVariables: string[],
  workflowVariableAliases: Set<string>,
): VariableHealthAnalysis {
  if (templateType === "docx") {
    if (report === undefined) {
      return EMPTY_ANALYSIS;
    }

    const countedReport = report as ValidationReportWithCount;
    return {
      totalVariableCount: countedReport.totalVariableCount,
      missing: report.missing.map((problem) => ({
        placeholder: problem.placeholder,
        raw: problem.raw,
        suggestion: problem.suggestions[0],
      })),
      unknownHelpers: report.unknownHelpers,
      syntaxErrors: report.syntaxErrors,
      unusedVariables: report.unusedVariables,
      loopScoped: report.loopScoped,
    };
  }

  return {
    ...EMPTY_ANALYSIS,
    totalVariableCount: templateVariables.length,
    missing: templateVariables
      .filter((variable) => !workflowVariableAliases.has(variable))
      .map((placeholder) => ({ placeholder })),
  };
}

function useAliasDrivenValidationRefresh(
  templateId: string,
  workflowId: string,
  enabled: boolean,
  aliasSignature: string,
): void {
  const queryClient = useQueryClient();
  const previousAliasSignature = useRef(aliasSignature);

  useEffect(() => {
    if (!enabled || previousAliasSignature.current === aliasSignature) {
      previousAliasSignature.current = aliasSignature;
      return;
    }

    previousAliasSignature.current = aliasSignature;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.templateValidation(templateId, workflowId),
      exact: true,
    });
  }, [aliasSignature, enabled, queryClient, templateId, workflowId]);
}

function SummarySeparator() {
  return <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>;
}

function ProblemDetails({ analysis }: { analysis: VariableHealthAnalysis }) {
  const hardErrorCount = analysis.syntaxErrors.length + analysis.unknownHelpers.length;

  return (
    <div className="space-y-2.5 border-t border-slate-200 pt-3 dark:border-slate-700">
      {hardErrorCount > 0 && (
        <section
          aria-label={`${hardErrorCount} upload-blocking ${hardErrorCount === 1 ? "error" : "errors"}`}
          className="rounded-md border border-red-200 bg-red-50 p-2.5 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
          role="alert"
        >
          <div className="mb-2 flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-700 dark:text-red-300" />
            <div>
              <p className="font-semibold">Upload-blocking errors</p>
              <p className="text-[11px] text-red-800 dark:text-red-200">Fix the template file before uploading it again.</p>
            </div>
          </div>
          <ul className="space-y-1.5 pl-5">
            {analysis.syntaxErrors.map((error, index) => (
              <li key={`${error}-${index}`} className="list-disc leading-snug">
                <span className="font-semibold">Syntax error:</span> {error}
              </li>
            ))}
            {analysis.unknownHelpers.map((helper) => (
              <li key={helper} className="list-disc leading-snug">
                <span className="font-semibold">Unknown filter:</span>{" "}
                <code className="rounded bg-white/70 px-1 py-0.5 font-mono dark:bg-black/20">{helper}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.missing.length > 0 && (
        <section
          aria-label={`${analysis.missing.length} unmapped variable ${analysis.missing.length === 1 ? "warning" : "warnings"}`}
          className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100"
          role="status"
        >
          <div className="mb-2 flex items-start gap-2">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <p className="font-semibold">Warnings — unmapped variables</p>
              <p className="text-[11px] text-amber-800 dark:text-amber-200">These do not block upload. Add or rename a workflow variable to map them.</p>
            </div>
          </div>
          <ul className="space-y-2">
            {analysis.missing.map((problem) => (
              <li key={problem.placeholder} className="rounded border border-amber-200/80 bg-white/70 p-2 dark:border-amber-900 dark:bg-black/20">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-semibold">Unmapped variable</span>
                  <code className="font-mono" title={problem.raw}>{problem.placeholder}</code>
                </div>
                {problem.suggestion !== undefined && (
                  <p className="mt-1 text-[11px] text-amber-900 dark:text-amber-100">
                    Did you mean <code className="font-mono font-semibold">{problem.suggestion}</code>?
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.unusedVariables.length > 0 && (
        <section
          aria-label={`${analysis.unusedVariables.length} unused workflow ${analysis.unusedVariables.length === 1 ? "variable" : "variables"}`}
          className="rounded-md border border-sky-200 bg-sky-50 p-2.5 text-sky-950 dark:border-sky-900 dark:bg-sky-950/35 dark:text-sky-100"
          role="note"
        >
          <div className="mb-2 flex items-start gap-2">
            <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700 dark:text-sky-300" />
            <div>
              <p className="font-semibold">Informational — unused workflow variables</p>
              <p className="text-[11px] text-sky-800 dark:text-sky-200">Check whether these questions should appear in this document.</p>
            </div>
          </div>
          <ul className="space-y-1.5 pl-5">
            {analysis.unusedVariables.map((variable) => (
              <li key={variable.alias} className="list-disc leading-snug">
                <code className="font-mono font-semibold">{variable.alias}</code>
                <span className="text-sky-800 dark:text-sky-200"> — {variable.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.loopScoped.length > 0 && (
        <div
          aria-label="Loop-scoped references are checked at generation time"
          className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          role="note"
        >
          <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            <span className="font-semibold text-slate-700 dark:text-slate-200">Loop-scoped:</span>{" "}
            {analysis.loopScoped.join(", ")}. Checked against list items at generation time, not treated as errors.
          </p>
        </div>
      )}
    </div>
  );
}

function VariableHealthSummary({
  analysis,
  isFetching,
  isLoading,
}: {
  analysis: VariableHealthAnalysis;
  isFetching: boolean;
  isLoading: boolean;
}) {
  const hardErrorCount = analysis.syntaxErrors.length + analysis.unknownHelpers.length;
  const warningCount = analysis.missing.length;
  const unusedCount = analysis.unusedVariables.length;
  const isClean = hardErrorCount === 0 && warningCount === 0 && unusedCount === 0;
  const summaryLabel = [
    `${analysis.totalVariableCount} ${analysis.totalVariableCount === 1 ? "variable" : "variables"}`,
    warningCount > 0 ? `${warningCount} unmapped` : null,
    hardErrorCount > 0 ? `${hardErrorCount} ${hardErrorCount === 1 ? "error" : "errors"}` : null,
    unusedCount > 0 ? `${unusedCount} unused` : null,
    isClean ? "all mapped" : null,
  ].filter((part): part is string => part !== null).join(", ");

  return (
    <div aria-label={`Variable health: ${summaryLabel}`} className="flex flex-wrap items-center gap-x-2 gap-y-1.5" role="group">
      <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
        {analysis.totalVariableCount} variable{analysis.totalVariableCount === 1 ? "" : "s"}
      </span>
      {isLoading ? (
        <>
          <SummarySeparator />
          <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" />
            Checking…
          </span>
        </>
      ) : (
        <>
          {warningCount > 0 && (
            <>
              <SummarySeparator />
              <span className="flex items-center gap-1 font-medium tabular-nums text-amber-700 dark:text-amber-300">
                <AlertCircle aria-hidden="true" className="h-3 w-3" />
                {warningCount} unmapped
              </span>
            </>
          )}
          {hardErrorCount > 0 && (
            <>
              <SummarySeparator />
              <span className="flex items-center gap-1 font-semibold tabular-nums text-red-700 dark:text-red-300">
                <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                {hardErrorCount} {hardErrorCount === 1 ? "error" : "errors"}
              </span>
            </>
          )}
          {unusedCount > 0 && (
            <>
              <SummarySeparator />
              <span className="flex items-center gap-1 font-medium tabular-nums text-sky-700 dark:text-sky-300">
                <Info aria-hidden="true" className="h-3 w-3" />
                {unusedCount} unused
              </span>
            </>
          )}
          {isClean && (
            <>
              <SummarySeparator />
              <span className="flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                All mapped
              </span>
            </>
          )}
        </>
      )}
      {isFetching && !isLoading && (
        <span className="sr-only" role="status">Refreshing variable health</span>
      )}
    </div>
  );
}

export function TemplateVariableHealth({
  templateId,
  templateType,
  templateVariables = [],
  workflowId,
  workflowVariableAliases,
}: TemplateVariableHealthProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDocx = templateType === "docx";
  const aliasSignature = useMemo(
    () => Array.from(workflowVariableAliases).sort().join("\u0000"),
    [workflowVariableAliases],
  );
  const { data: report, isError, isFetching, isLoading } = useTemplateValidation(templateId, workflowId, isDocx);

  useAliasDrivenValidationRefresh(templateId, workflowId, isDocx, aliasSignature);

  const analysis = getVariableHealth(templateType, report, templateVariables, workflowVariableAliases);
  const hardErrorCount = analysis.syntaxErrors.length + analysis.unknownHelpers.length;
  const warningCount = analysis.missing.length;
  const unusedCount = analysis.unusedVariables.length;
  const detailCount = hardErrorCount + warningCount + unusedCount + analysis.loopScoped.length;

  if (isDocx && isError) {
    return (
      <div
        aria-label="Variable health unavailable"
        className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
        role="status"
      >
        <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        Couldn&apos;t check variable health. Try again shortly.
      </div>
    );
  }

  return (
    <Collapsible className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/60" onOpenChange={setIsOpen} open={isOpen}>
      <VariableHealthSummary analysis={analysis} isFetching={isFetching} isLoading={isLoading} />

      {!isLoading && detailCount > 0 && (
        <CollapsibleTrigger asChild>
          <Button
            aria-label={`${isOpen ? "Hide" : "Review"} variable health details`}
            className="mt-2 h-7 w-full justify-between px-2 text-xs text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            size="sm"
            variant="ghost"
          >
            <span>{isOpen ? "Hide details" : "Review details"}</span>
            <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", isOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
      )}

      {detailCount > 0 && (
        <CollapsibleContent>
          <ProblemDetails analysis={analysis} />
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
