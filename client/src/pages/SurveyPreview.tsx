import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { Survey, SurveyPage, Question } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Eye } from "lucide-react";
import QuestionRenderer from "@/components/survey/QuestionRenderer";
import ProgressBar from "@/components/survey/ProgressBar";
import { StatusBadge } from "@/components/shared/StatusBadge";

export default function SurveyPreview() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "Please log in to preview surveys",
        variant: "destructive",
      });
      navigate("/");
    }
  }, [isAuthenticated, authLoading, toast, navigate]);

  // Load survey
  const { data: survey, isLoading: surveyLoading } = useQuery<Survey>({
    queryKey: ["/api/surveys", id],
    enabled: !!id && isAuthenticated,
  });

  // Load survey pages with questions (same pattern as builder)
  const { data: pages, isLoading: pagesLoading } = useQuery<(SurveyPage & { questions: Question[] })[]>({
    queryKey: ["/api/surveys", id, "pages"],
    queryFn: async () => {
      const response = await fetch(`/api/surveys/${id}/pages?includeQuestions=true`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch pages');
      return response.json();
    },
    enabled: !!id && isAuthenticated,
    // Don't use staleTime: 0 as it bypasses cache and overwrites optimistic updates
    // Let React Query handle caching normally
  });

  // Get current page and its questions
  const currentPage = pages?.[currentPageIndex];
  const questions = currentPage?.questions || [];

  if (authLoading || surveyLoading || pagesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (!survey || !pages) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Survey Not Found</CardTitle>
            <CardDescription>The survey you're looking for doesn't exist.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/surveys")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Surveys
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPages = pages.length;
  const progress = totalPages > 0 ? ((currentPageIndex + 1) / totalPages) * 100 : 0;

  const handleNext = () => {
    if (currentPageIndex < totalPages - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    }
  };

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleBackToBuilder = () => {
    navigate(`/builder/${id}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Preview Banner */}
      <div className="sticky top-0 z-50 bg-blue-600 text-white py-3 px-4 shadow-md">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5" />
            <span className="font-medium">Preview Mode</span>
            <span className="text-blue-100 text-sm">
              This is how your survey will appear to respondents
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBackToBuilder}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Editor
          </Button>
        </div>
      </div>

      <div className="container mx-auto py-8 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Survey Header */}
          <Card className="mb-6 shadow-lg border-2">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-3xl">{survey.title}</CardTitle>
                <StatusBadge status={survey.status} />
              </div>
              {survey.description && (
                <CardDescription className="text-base">
                  {survey.description}
                </CardDescription>
              )}
            </CardHeader>
          </Card>

          {/* Progress Bar */}
          {totalPages > 1 && (
            <div className="mb-6">
              <ProgressBar
                current={currentPageIndex + 1}
                total={totalPages}
                percentage={progress}
              />
            </div>
          )}

          {/* Current Page */}
          {currentPage && (
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl">
                  {currentPage.title}
                  {totalPages > 1 && (
                    <span className="text-sm text-muted-foreground ml-2">
                      (Page {currentPageIndex + 1} of {totalPages})
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {questions && questions.length > 0 ? (
                  questions.map((question) => (
                    <div key={question.id} className="p-4 bg-muted/30 rounded-lg">
                      <QuestionRenderer
                        question={{
                          id: question.id,
                          type: question.type,
                          title: question.title,
                          description: question.description || undefined,
                          required: question.required || false,
                          options: question.options as (string | { text: string; value: string })[] | undefined,
                          loopConfig: question.loopConfig as any,
                          subquestions: (question as any).subquestions,
                        } as any}
                        value={answers[question.id]}
                        onChange={(value) => handleAnswerChange(question.id, value)}
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">
                      No questions on this page yet
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-6">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentPageIndex === 0}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>

            {currentPageIndex < totalPages - 1 ? (
              <Button onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button disabled>
                Submit (Preview Only)
              </Button>
            )}
          </div>

          {/* Preview Info */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              <strong>Note:</strong> This is a preview of your survey. Responses will not be saved.
              Use this to test the flow and appearance before publishing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
