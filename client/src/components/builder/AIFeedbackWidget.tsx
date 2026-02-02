import { CheckCircle2, Lightbulb, X } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { fetchAPI } from '@/lib/vault-api';

import type { QualityScore } from '@shared/types/ai';

// Imported sub-components
import { IssueList } from './ai-feedback/IssueList';
import { QualityBreakdown, QualityHeader } from './ai-feedback/QualityBreakdown';
import { RatingInput } from './ai-feedback/RatingInput';

export { type QualityScore };

interface AIFeedbackWidgetProps {
  workflowId?: string;
  operationType: 'generation' | 'revision' | 'suggestion' | 'logic' | 'optimization';
  qualityScore?: QualityScore;
  aiProvider?: string;
  aiModel?: string;
  requestDescription?: string;
  generatedSections?: number;
  generatedSteps?: number;
  onClose?: () => void;
  className?: string;
}

export function AIFeedbackWidget({
  workflowId,
  operationType,
  qualityScore,
  aiProvider,
  aiModel,
  requestDescription,
  generatedSections,
  generatedSteps,
  onClose,
  className,
}: AIFeedbackWidgetProps) {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({
        title: 'Rating Required',
        description: 'Please select a rating before submitting.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await fetchAPI('/api/ai/feedback', {
        method: 'POST',
        body: JSON.stringify({
          workflowId: workflowId ? workflowId : undefined,
          operationType,
          rating,
          comment: comment.trim() === '' ? undefined : comment.trim(),
          aiProvider,
          aiModel,
          qualityScore: qualityScore?.overall,
          qualityPassed: qualityScore?.passed,
          issuesCount: qualityScore?.issues.length,
          requestDescription,
          generatedSections,
          generatedSteps,
        }),
      });

      setIsSubmitted(true);
      toast({
        title: 'Feedback Submitted',
        description: 'Thank you for helping us improve!',
      });

      if (onClose) {
        setTimeout(onClose, 2000);
      }
    } catch (error: unknown) {
      console.error('Failed to submit feedback:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit feedback. Please try again.';
      toast({
        title: 'Submission Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
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

  return (
    <Card className={cn('border-indigo-200 dark:border-indigo-800', className)}>
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
            onChange={(e) => { void setComment(e.target.value); }}
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
            onClick={() => { void handleSubmit(); }}
            disabled={rating === 0 || isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
