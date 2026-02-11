
import { Lightbulb , X } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

import { QualityScore } from '@shared/types/ai';

import { IssueList } from './IssueList';
import { QualityBreakdown, QualityHeader } from './QualityBreakdown';
import { RatingInput } from './RatingInput';


interface FeedbackFormContentProps {
    qualityScore?: QualityScore;
    onClose?: () => void;
    rating: number;
    setRating: (rating: number) => void;
    comment: string;
    setComment: (comment: string) => void;
    onSubmit: () => void;
    isSubmitting: boolean;
}

export function FeedbackFormContent({
    qualityScore,
    onClose,
    rating,
    setRating,
    comment,
    setComment,
    onSubmit,
    isSubmitting
}: FeedbackFormContentProps) {
    return (
        <>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                            AI Quality & Feedback
                            {qualityScore && <QualityHeader qualityScore={qualityScore} />}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            Rate the AI&apos;s performance to help us improve
                        </CardDescription>
                    </div>
                    {onClose && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { void onClose(); }}>
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {qualityScore && (
                    <>
                        <QualityBreakdown qualityScore={qualityScore} />
                        <IssueList issues={qualityScore.issues} />
                        <Separator />
                    </>
                )}

                <RatingInput rating={rating} setRating={setRating} />

                <div className="space-y-2">
                    <h4 className="text-sm font-medium">Additional Comments (Optional)</h4>
                    <Textarea
                        placeholder="Tell us what worked well or what could be improved..."
                        value={comment}
                        onChange={(e) => { setComment(e.target.value); }}
                        rows={3}
                        className="text-sm resize-none"
                    />
                </div>

                {qualityScore?.suggestions && qualityScore.suggestions.length > 0 && (
                    <Alert>
                        <Lightbulb className="w-4 h-4" />
                        <AlertDescription className="text-xs">
                            <strong>Suggestions:</strong>
                            <ul className="list-disc list-inside mt-1 space-y-0.5">
                                {qualityScore.suggestions.slice(0, 3).map((suggestion, idx) => (
                                    <li key={idx}>{suggestion}</li>
                                ))}
                            </ul>
                        </AlertDescription>
                    </Alert>
                )}

                <div className="flex gap-2 justify-end pt-2">
                    {onClose && (
                        <Button variant="outline" onClick={() => { void onClose(); }} disabled={isSubmitting}>
                            Skip
                        </Button>
                    )}
                    <Button
                        onClick={() => { void onSubmit(); }}
                        disabled={rating === 0 || isSubmitting}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                    </Button>
                </div>
            </CardContent>
        </>
    );
}
