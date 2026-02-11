
import { CheckCircle2 } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface FeedbackSuccessMessageProps {
    className?: string;
}

export function FeedbackSuccessMessage({ className }: FeedbackSuccessMessageProps) {
    return (
        <Card className={cn('border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10', className)}>
            <CardContent className="pt-6 flex flex-col items-center justify-center text-center space-y-3">
                <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                    <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">Thank You!</h3>
                <p className="text-sm text-green-700 dark:text-green-300">Your feedback helps us improve the AI assistant.</p>
            </CardContent>
        </Card>
    );
}
