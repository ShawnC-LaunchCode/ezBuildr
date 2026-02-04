
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface ReviewIssue {
    type: 'warning' | 'info' | 'success';
    message: string;
    sectionId?: string;
    stepId?: string;
}

interface ReviewIssueListProps {
    isReady: boolean;
    missingAliases: number;
    emptyTitles: number;
    activeIssues: ReviewIssue[];
    workflowId: string;
    onFix: (path: string) => void;
}

export function ReviewIssueList({ isReady, missingAliases, emptyTitles, activeIssues, workflowId, onFix }: ReviewIssueListProps) {
    return (
        <div className="space-y-4">
            {/* Ready Status */}
            {isReady && missingAliases === 0 ? (
                <div className="flex items-center gap-3 p-3 bg-green-50 text-green-700 rounded-md border border-green-100">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <div>
                        <p className="font-medium">Everything looks great!</p>
                        <p className="text-sm opacity-90">Your workflow is well-structured and all questions are named.</p>
                    </div>
                </div>
            ) : null}

            {/* Blocking Issues (Empty Titles) */}
            {emptyTitles > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-amber-600 font-medium">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Questions missing text ({emptyTitles})</span>
                    </div>
                    <div className="pl-6 space-y-1">
                        <p className="text-sm text-slate-500 mb-2">
                            Some questions are blank. Your client won't know what to answer.
                        </p>
                        {activeIssues.filter(i => i.type === 'warning').map((issue, idx) => (
                            <div key={idx} className="text-sm p-2 bg-amber-50 rounded border border-amber-100 flex items-center justify-between">
                                <span className="text-amber-800">{issue.message}</span>
                                <Button variant="ghost" size="sm" className="h-6 text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                                    onClick={() => onFix(`/workflows/${workflowId}/builder?tab=sections`)}
                                >
                                    Fix
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Soft Suggestions (Aliases) */}
            {missingAliases > 0 && (
                <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-2 text-slate-600 font-medium">
                        <Info className="w-4 h-4 text-blue-500" />
                        <span>Unnamed answers ({missingAliases})</span>
                    </div>
                    <div className="pl-6 space-y-1">
                        <p className="text-sm text-slate-500 mb-2">
                            Naming answers (&quot;Save answer as&quot;) helps you reuse them in documents later.
                            It's okay to skip this if you don't need to reuse the answer.
                        </p>
                        <div className="text-sm text-slate-500 italic">
                            Review the &quot;Save answer as&quot; field in your questions.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
