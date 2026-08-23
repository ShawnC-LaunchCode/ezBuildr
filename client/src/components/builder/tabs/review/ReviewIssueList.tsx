import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
    WorkflowLintCategory,
    WorkflowLintIssue,
    WorkflowLintTarget,
} from "@shared/types/workflowLint";

export type ReviewIssue = WorkflowLintIssue;

interface ReviewIssueListProps {
    isReady: boolean;
    isLinting: boolean;
    issues: ReviewIssue[];
    workflowId: string;
    onFix: (path: string) => void;
}

const CATEGORY_TABS: { id: WorkflowLintCategory; label: string }[] = [
    { id: "questions", label: "Questions" },
    { id: "logic", label: "Logic" },
    { id: "documents", label: "Documents" },
    { id: "integrations", label: "Integrations" },
];

/**
 * Which tab to open on. A blocking gate that opens on an empty "Questions" tab
 * while the errors sit under "Documents" buries the reason publishing is
 * refused, so land on the errors first, then any finding, then the default.
 */
export function defaultIssueCategory(issues: ReviewIssue[]): WorkflowLintCategory {
    const firstWith = (predicate: (issue: ReviewIssue) => boolean): WorkflowLintCategory | undefined =>
        CATEGORY_TABS.find(category => issues.some(issue => issue.category === category.id && predicate(issue)))?.id;
    return firstWith(issue => issue.type === "error")
        ?? firstWith(() => true)
        ?? "questions";
}

export function buildIssuePath(workflowId: string, target: WorkflowLintTarget): string {
    const params = new URLSearchParams({ tab: target.tab });
    if (target.pageId) { params.set("pageId", target.pageId); }
    if (target.stepId) { params.set("stepId", target.stepId); }
    if (target.blockId) { params.set("blockId", target.blockId); }
    if (target.panel) { params.set("panel", target.panel); }
    return `/workflows/${workflowId}/builder?${params.toString()}`;
}

function IssueRows({
    issues,
    workflowId,
    onFix,
}: {
    issues: ReviewIssue[];
    workflowId: string;
    onFix: (path: string) => void;
}) {
    if (issues.length === 0) {
        return <p className="py-6 text-center text-sm text-slate-500">No findings in this category.</p>;
    }

    return (
        <div className="space-y-3 pt-2">
            {issues.map((issue, index) => {
                const isError = issue.type === "error";
                const path = buildIssuePath(workflowId, issue.target);
                const Icon = isError ? XCircle : AlertTriangle;
                return (
                    <div
                        key={`${issue.type}-${issue.message}-${index}`}
                        className={cn(
                            "flex items-start justify-between gap-3 rounded border p-3 text-sm",
                            isError ? "border-red-100 bg-red-50" : "border-amber-100 bg-amber-50"
                        )}
                    >
                        <div className="flex min-w-0 items-start gap-2">
                            <Icon
                                className={cn("mt-0.5 h-4 w-4 shrink-0", isError ? "text-red-600" : "text-amber-600")}
                                aria-hidden="true"
                            />
                            <div>
                                <p className={cn("font-medium", isError ? "text-red-800" : "text-amber-800")}>
                                    {isError ? "Blocking error" : "Warning"}
                                </p>
                                <p className={cn("mt-0.5", isError ? "text-red-700" : "text-amber-700")}>
                                    {issue.message}
                                </p>
                            </div>
                        </div>
                        <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "h-7 shrink-0",
                                isError
                                    ? "text-red-700 hover:bg-red-100 hover:text-red-900"
                                    : "text-amber-700 hover:bg-amber-100 hover:text-amber-900"
                            )}
                        >
                            <a
                                href={path}
                                onClick={(event) => {
                                    event.preventDefault();
                                    onFix(path);
                                }}
                            >
                                Fix
                            </a>
                        </Button>
                    </div>
                );
            })}
        </div>
    );
}

export function ReviewIssueList({ isReady, isLinting, issues, workflowId, onFix }: ReviewIssueListProps) {
    if (isLinting) {
        return (
            <div className="flex items-center gap-3 p-3 text-slate-500">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                <p className="text-sm">Running structural checks…</p>
            </div>
        );
    }

    const warnings = issues.filter(issue => issue.type === "warning");

    return (
        <div className="space-y-4">
            {isReady ? (
                <div className="flex items-center gap-3 rounded-md border border-green-100 bg-green-50 p-3 text-green-700">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-medium">Ready to publish</p>
                        <p className="text-sm opacity-90">
                            {warnings.length > 0
                                ? "No blocking errors. Publishing with these warnings records them in the audit log."
                                : "Your workflow is well-structured and passed every check."}
                        </p>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-slate-500">
                    Blocking errors must be fixed before publishing. Warnings do not block publishing.
                </p>
            )}

            <Tabs defaultValue={defaultIssueCategory(issues)} className="w-full">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-4">
                    {CATEGORY_TABS.map(category => {
                        const count = issues.filter(issue => issue.category === category.id).length;
                        return (
                            <TabsTrigger key={category.id} value={category.id}>
                                {category.label}
                                <span className="ml-1 text-xs text-slate-500">({count})</span>
                            </TabsTrigger>
                        );
                    })}
                </TabsList>
                {CATEGORY_TABS.map(category => (
                    <TabsContent key={category.id} value={category.id}>
                        <IssueRows
                            issues={issues.filter(issue => issue.category === category.id)}
                            workflowId={workflowId}
                            onFix={onFix}
                        />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
