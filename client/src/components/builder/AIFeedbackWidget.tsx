import { Star, ThumbsUp, ThumbsDown, AlertCircle, CheckCircle2, AlertTriangle, Lightbulb, X } from 'lucide-react';
import React, { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { fetchAPI } from '@/lib/vault-api';

export interface QualityScore {
  overall: number; // 0-100
  breakdown: {
    aliases: number;
    types: number;
    structure: number;
    ux: number;
    completeness: number;
    validation: number;
  };
  issues: Array<{
    category: string;
    severity: 'error' | 'warning' | 'suggestion';
    message: string;
    stepAlias?: string;
  }>;
  passed: boolean;
  suggestions: string[];
}

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
  const [hoveredRating, setHoveredRating] = useState<number>(0);
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
          workflowId: workflowId || undefined,
          operationType,
          rating,
          comment: comment.trim() || undefined,
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

      // Auto-close after 2 seconds if onClose provided
      if (onClose) {
        setTimeout(onClose, 2000);
      }
    } catch (error: any) {
      console.error('Failed to submit feedback:', error);
      toast({
        title: 'Submission Failed',
        description: error.message || 'Failed to submit feedback. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) {return 'text-green-600 dark:text-green-400';}
    if (score >= 70) {return 'text-yellow-600 dark:text-yellow-400';}
    return 'text-red-600 dark:text-red-400';
  };

  const getQualityBadgeVariant = (score: number) => {
    if (score >= 80) {return 'default';}
    if (score >= 70) {return 'secondary';}
    return 'destructive';
  };

  const severityIcon = {
    error: <AlertCircle className="w-4 h-4 text-red-500" />,
    warning: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
    suggestion: <Lightbulb className="w-4 h-4 text-blue-500" />,
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
              {qualityScore && (
                <Badge variant={getQualityBadgeVariant(qualityScore.overall)} className="ml-2">
                  {qualityScore.overall}/100
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              Rate the AI's performance to help us improve
            </CardDescription>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quality Score Breakdown */}
        {qualityScore && (
          <>
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

            {/* Issues */}
            {qualityScore.issues.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">
                  Issues Found ({qualityScore.issues.length})
                </h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {qualityScore.issues.slice(0, 5).map((issue, idx) => (
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
                  {qualityScore.issues.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center py-1">
                      +{qualityScore.issues.length - 5} more issues
                    </p>
                  )}
                </div>
              </div>
            )}

            <Separator />
          </>
        )}

        {/* Rating */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">How would you rate this AI result?</h4>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                onMouseEnter={() => setHoveredRating(value)}
                onMouseLeave={() => setHoveredRating(0)}
                className="transition-transform hover:scale-110 active:scale-95"
              >
                <Star
                  className={cn(
                    'w-8 h-8 transition-colors',
                    (hoveredRating || rating) >= value
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300 dark:text-gray-600'
                  )}
                />
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">
                {rating === 1 && 'Poor'}
                {rating === 2 && 'Fair'}
                {rating === 3 && 'Good'}
                {rating === 4 && 'Very Good'}
                {rating === 5 && 'Excellent'}
              </span>
            )}
          </div>
        </div>

        {/* Quick Reactions (Optional) */}
        {rating > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant={rating >= 4 ? 'default' : 'outline'}
              size="sm"
              className="text-xs"
              onClick={() => setRating(5)}
            >
              <ThumbsUp className="w-3 h-3 mr-1" />
              Helpful
            </Button>
            <Button
              variant={rating <= 2 ? 'default' : 'outline'}
              size="sm"
              className="text-xs"
              onClick={() => setRating(1)}
            >
              <ThumbsDown className="w-3 h-3 mr-1" />
              Not Helpful
            </Button>
          </div>
        )}

        {/* Comment */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Additional Comments (Optional)</h4>
          <Textarea
            placeholder="Tell us what worked well or what could be improved..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="text-sm resize-none"
          />
        </div>

        {/* Suggestions */}
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

        {/* Submit */}
        <div className="flex gap-2 justify-end pt-2">
          {onClose && (
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Skip
            </Button>
          )}
          <Button
            onClick={handleSubmit}
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
