
import { AlertCircle, AlertTriangle, CheckCircle, Edit, Loader2, TestTube, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useTemplateValidation } from "@/hooks/api/useTemplateValidation";
import { cn } from "@/lib/utils";

export interface Template {
    id: string;
    name: string;
    key: string;
    type: "docx" | "pdf";
    lastUpdated: string;
    fileSize?: number;
    variables?: string[];
}

interface TemplateCardProps {
    template: Template;
    workflowId: string;
    workflowVariableAliases: Set<string>;
    onEdit: (template: Template) => void;
    onTest: (id: string) => void;
    onDelete: (id: string, name: string) => void;
}

interface VariableAnalysis {
    matched: number;
    total: number;
    missing: Array<{ placeholder: string; suggestion?: string }>;
    loopScopedCount: number;
    syntaxErrors: string[];
    unknownHelpers: string[];
    loading: boolean;
}

// eslint-disable-next-line max-lines-per-function
export function TemplateCard({
    template,
    workflowId,
    workflowVariableAliases,
    onEdit,
    onTest,
    onDelete
}: TemplateCardProps) {
    // Server-side validation compares real DOCX placeholders against workflow
    // variables; PDF templates use field mappings instead, so fall back to the
    // client-side alias check for them
    const { data: report, isLoading } = useTemplateValidation(
        template.id,
        workflowId,
        template.type === "docx"
    );

    const analysis: VariableAnalysis = (() => {
        if (template.type === "docx") {
            if (report === undefined) {
                return { matched: 0, total: 0, missing: [], loopScopedCount: 0, syntaxErrors: [], unknownHelpers: [], loading: isLoading };
            }
            return {
                matched: report.matched.length,
                total: report.matched.length + report.missing.length,
                missing: report.missing.map((m) => ({
                    placeholder: m.placeholder,
                    suggestion: m.suggestions[0],
                })),
                loopScopedCount: report.loopScoped.length,
                syntaxErrors: report.syntaxErrors,
                unknownHelpers: report.unknownHelpers ?? [],
                loading: false,
            };
        }

        const templateVars = template.variables ?? [];
        const matched = templateVars.filter((v) => workflowVariableAliases.has(v));
        return {
            matched: matched.length,
            total: templateVars.length,
            missing: templateVars
                .filter((v) => !workflowVariableAliases.has(v))
                .map((v) => ({ placeholder: v })),
            loopScopedCount: 0,
            syntaxErrors: [],
            unknownHelpers: [],
            loading: false,
        };
    })();

    const hasMissing = analysis.missing.length > 0 || analysis.unknownHelpers.length > 0;
    const hasSyntaxErrors = analysis.syntaxErrors.length > 0;

    return (
        <Card className="flex flex-col hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                        <CardTitle className="text-base truncate leading-tight" title={template.name}>
                            {template.name}
                        </CardTitle>
                        <CardDescription className="font-mono text-[10px] mt-1 text-slate-400 truncate">
                            {template.key}
                        </CardDescription>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 h-5 font-normal text-slate-500">
                        {template.type.toUpperCase()}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
                {/* Variable Analysis Feedback */}
                <div className="rounded-md bg-slate-50 p-3 text-xs space-y-2 border border-slate-100">
                    <div className="flex items-center justify-between font-medium">
                        <span className="text-slate-500">Variables</span>
                        {analysis.loading ? (
                            <span className="text-slate-400 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Checking…
                            </span>
                        ) : hasSyntaxErrors ? (
                            <span className="text-red-600 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Template error
                            </span>
                        ) : hasMissing ? (
                            <span className="text-amber-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {analysis.missing.length > 0 ? `${analysis.missing.length} missing` : `${analysis.unknownHelpers.length} unknown helpers`}
                            </span>
                        ) : (
                            <span className="text-emerald-600 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                {analysis.matched}/{analysis.total} matched
                            </span>
                        )}
                    </div>
                    {/* Progress Bar */}
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full transition-all",
                                hasSyntaxErrors ? "bg-red-500" : hasMissing ? "bg-amber-500" : "bg-emerald-500"
                            )}
                            style={{
                                width: hasSyntaxErrors
                                    ? "100%"
                                    : `${analysis.total > 0 ? (analysis.matched / analysis.total) * 100 : 100}%`,
                            }}
                        />
                    </div>
                    {hasSyntaxErrors && (
                        <div className="pt-2 border-t border-slate-200/50 mt-2">
                            <p className="font-semibold text-red-700 mb-1">Fix the template file:</p>
                            {analysis.syntaxErrors.slice(0, 2).map((err) => (
                                <p key={err} className="text-red-600 text-[10px] leading-snug">{err}</p>
                            ))}
                        </div>
                    )}
                    {!hasSyntaxErrors && hasMissing && (
                        <div className="pt-2 border-t border-slate-200/50 mt-2">
                            <p className="font-semibold text-amber-700 mb-1.5">No matching variable:</p>
                            <div className="flex flex-wrap gap-1">
                                {analysis.missing.slice(0, 3).map((m) => (
                                    <code
                                        key={m.placeholder}
                                        className="bg-white text-amber-700 px-1 py-0.5 rounded border border-amber-200 shadow-sm text-[10px]"
                                        title={m.suggestion !== undefined ? `Did you mean "${m.suggestion}"?` : undefined}
                                    >
                                        {m.placeholder}
                                        {m.suggestion !== undefined && (
                                            <span className="text-emerald-700"> → {m.suggestion}?</span>
                                        )}
                                    </code>
                                ))}
                                {analysis.missing.length > 3 && (
                                    <span className="text-amber-600 text-[10px] self-center">
                                        +{analysis.missing.length - 3}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    {!hasSyntaxErrors && analysis.unknownHelpers.length > 0 && (
                        <div className="pt-2 border-t border-slate-200/50 mt-2">
                            <p className="font-semibold text-amber-700 mb-1.5">Unknown helpers referenced:</p>
                            <div className="flex flex-wrap gap-1">
                                {analysis.unknownHelpers.map((helper) => (
                                    <code
                                        key={helper}
                                        className="bg-white text-amber-700 px-1 py-0.5 rounded border border-amber-200 shadow-sm text-[10px]"
                                        title={`Helper "${helper}" is not in the registry`}
                                    >
                                        {helper}
                                    </code>
                                ))}
                            </div>
                        </div>
                    )}
                    {!hasSyntaxErrors && analysis.loopScopedCount > 0 && (
                        <p className="text-slate-400 text-[10px]">
                            {analysis.loopScopedCount} field{analysis.loopScopedCount === 1 ? "" : "s"} inside loops
                            (resolved from list items at generation time)
                        </p>
                    )}
                </div>
            </CardContent>
            <CardFooter className="pt-0 flex gap-2 justify-end border-t bg-slate-50/30 p-3">
                <Button size="sm" variant="default" className="h-7 text-xs px-3 shadow-sm" onClick={() => onEdit(template)}>
                    <Edit className="w-3 h-3 mr-1.5" />
                    {template.type === 'pdf' ? 'Map Fields' : 'Preview'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onTest(template.id)} title="Test Generation">
                    <TestTube className="w-3.5 h-3.5 text-slate-500" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive text-slate-400" onClick={() => onDelete(template.id, template.name)} title="Delete Template">
                    <Trash2 className="w-3.5 h-3.5" />
                </Button>
            </CardFooter>
        </Card>
    );
}
