import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface ReviewIssue {
    type: 'error' | 'warning' | 'info' | 'success';
    message: string;
    sectionId?: string;
    stepId?: string;
}

interface ReviewIssueListProps {
    isReady: boolean;
    isLinting: boolean;
    issues: ReviewIssue[];
    workflowId: string;
    onFix: (path: string) => void;
}

interface IssueGroupProps {
    issues: ReviewIssue[];
    workflowId: string;
    onFix: (path: string) => void;
}

/** Blocking issues — must be resolved before the workflow can be activated. */
function ErrorGroup({ issues, workflowId, onFix }: IssueGroupProps) {
    if (issues.length === 0) { return null; }
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-red-600 font-medium">
                <XCircle className="w-4 h-4" />
                <span>Must fix before publishing ({issues.length})</span>
            </div>
            <div className="pl-6 space-y-1">
                <p className="text-sm text-slate-500 mb-2">
                    These block activation. Resolve them, then re-run the checks.
                </p>
                {issues.map((issue, idx) => (
                    <div key={idx} className="text-sm p-2 bg-red-50 rounded border border-red-100 flex items-center justify-between gap-2">
                        <span className="text-red-800">{issue.message}</span>
                        <Button variant="ghost" size="sm" className="h-6 shrink-0 text-red-700 hover:text-red-900 hover:bg-red-100"
                            onClick={() => onFix(`/workflows/${workflowId}/builder?tab=sections`)}
                        >
                            Fix
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Non-blocking suggestions — surfaced but do not prevent activation. */
function WarningGroup({ issues, workflowId, onFix }: IssueGroupProps) {
    if (issues.length === 0) { return null; }
    return (
        <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2 text-amber-600 font-medium">
                <AlertTriangle className="w-4 h-4" />
                <span>Suggestions ({issues.length})</span>
            </div>
            <div className="pl-6 space-y-1">
                <p className="text-sm text-slate-500 mb-2">
                    Optional — your workflow can still go live with these open.
                </p>
                {issues.map((issue, idx) => (
                    <div key={idx} className="text-sm p-2 bg-amber-50 rounded border border-amber-100 flex items-center justify-between gap-2">
                        <span className="text-amber-800">{issue.message}</span>
                        <Button variant="ghost" size="sm" className="h-6 shrink-0 text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                            onClick={() => onFix(`/workflows/${workflowId}/builder?tab=sections`)}
                        >
                            Fix
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Purely informational notes. */
function InfoGroup({ issues }: { issues: ReviewIssue[] }) {
    if (issues.length === 0) { return null; }
    return (
        <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2 text-slate-600 font-medium">
                <Info className="w-4 h-4 text-blue-500" />
                <span>Notes ({issues.length})</span>
            </div>
            <div className="pl-6 space-y-1">
                {issues.map((issue, idx) => (
                    <div key={idx} className="text-sm text-slate-500 italic">{issue.message}</div>
                ))}
            </div>
        </div>
    );
}

export function ReviewIssueList({ isReady, isLinting, issues, workflowId, onFix }: ReviewIssueListProps) {
    if (isLinting) {
        return (
            <div className="flex items-center gap-3 p-3 text-slate-500">
                <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
                <p className="text-sm">Running structural checks…</p>
            </div>
        );
    }

    const errors = issues.filter(i => i.type === 'error');
    const warnings = issues.filter(i => i.type === 'warning');
    const notes = issues.filter(i => i.type === 'info');

    return (
        <div className="space-y-4">
            {isReady ? (
                <div className="flex items-center gap-3 p-3 bg-green-50 text-green-700 rounded-md border border-green-100">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <div>
                        <p className="font-medium">Ready to publish</p>
                        <p className="text-sm opacity-90">
                            {warnings.length > 0
                                ? "No blocking issues — a few optional suggestions remain below."
                                : "Your workflow is well-structured and passed every check."}
                        </p>
                    </div>
                </div>
            ) : null}

            <ErrorGroup issues={errors} workflowId={workflowId} onFix={onFix} />
            <WarningGroup issues={warnings} workflowId={workflowId} onFix={onFix} />
            <InfoGroup issues={notes} />
        </div>
    );
}
