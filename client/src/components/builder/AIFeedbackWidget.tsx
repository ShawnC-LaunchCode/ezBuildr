import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { fetchAPI } from '@/lib/vault-api';

import type { QualityScore } from '@shared/types/ai';

// Imported sub-components
import { FeedbackFormContent } from './ai-feedback/FeedbackFormContent';
import { FeedbackSuccessMessage } from './ai-feedback/FeedbackSuccessMessage';
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
      <FeedbackSuccessMessage className={className} />
    );
  }

  return (
    <Card className={cn('border-indigo-200 dark:border-indigo-800', className)}>
      <FeedbackFormContent
        qualityScore={qualityScore}
        onClose={onClose}
        rating={rating}
        setRating={setRating}
        comment={comment}
        setComment={setComment}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </Card>
  );
}
