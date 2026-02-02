import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { QualityScore } from '@shared/types/ai';

interface QualityBreakdownProps {
    qualityScore: QualityScore;
}

export function QualityBreakdown({ qualityScore }: QualityBreakdownProps) {
    const getQualityColor = (score: number) => {
        if (score >= 80) { return 'text-green-600 dark:text-green-400'; }
        if (score >= 70) { return 'text-yellow-600 dark:text-yellow-400'; }
        return 'text-red-600 dark:text-red-400';
    };

    return (
        <div className="space-y-2">
            <h4 className="text-sm font-medium">Quality Breakdown</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(qualityScore.breakdown).map(([category, score]) => (
                    <div key={category} className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="capitalize">{category}</span>
                        <span className={cn('font-semibold', getQualityColor(score))}>{score}/100</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function QualityHeader({ qualityScore }: { qualityScore: QualityScore }) {
    const getQualityBadgeVariant = (score: number) => {
        if (score >= 80) { return 'default'; }
        if (score >= 70) { return 'secondary'; }
        return 'destructive';
    };

    return (
        <Badge variant={getQualityBadgeVariant(qualityScore.overall)} className="ml-2">
            {qualityScore.overall}/100
        </Badge>
    );
}
