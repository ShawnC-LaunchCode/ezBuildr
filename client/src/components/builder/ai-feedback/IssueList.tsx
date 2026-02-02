import { AlertCircle, AlertTriangle, Lightbulb } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

import { QualityScore } from '@shared/types/ai';

interface IssueListProps {
    issues: QualityScore['issues'];
}

export function IssueList({ issues }: IssueListProps) {
    const severityIcon = {
        error: <AlertCircle className="w-4 h-4 text-red-500" />,
        warning: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
        suggestion: <Lightbulb className="w-4 h-4 text-blue-500" />,
    };

    if (issues.length === 0) { return null; }

    return (
        <div className="space-y-2">
            <h4 className="text-sm font-medium">
                Issues Found ({issues.length})
            </h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
                {issues.slice(0, 5).map((issue, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 bg-muted rounded text-xs">
                        {severityIcon[issue.severity]}
                        <div className="flex-1">
                            <div className="flex items-center gap-1">
                                <span className="font-medium capitalize">{issue.category}</span>
                                {issue.stepAlias && (
                                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                                        {issue.stepAlias}
                                    </Badge>
                                )}
                            </div>
                            <p className="text-muted-foreground mt-0.5">{issue.message}</p>
                        </div>
                    </div>
                ))}
                {issues.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center py-1">
                        +{issues.length - 5} more issues
                    </p>
                )}
            </div>
        </div>
    );
}
