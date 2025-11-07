import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Survey, SurveyPage, ConditionalRule, QuestionWithSubquestions } from "@shared/schema";

interface SurveyPageWithQuestions extends SurveyPage {
  questions?: QuestionWithSubquestions[];
}

interface SurveyData {
  survey: Survey;
  pages?: SurveyPageWithQuestions[];
  recipient?: any; // Recipient type not defined in schema
  anonymous?: boolean;
  alreadyCompleted?: boolean;
  submittedAt?: string;
}

export function useSurveyPlayer(identifier: string | undefined) {
  const { toast } = useToast();

  // State
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [answerIds, setAnswerIds] = useState<Record<string, string>>({});
  const [responseId, setResponseId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [surveyStartTime, setSurveyStartTime] = useState<number | null>(null);

  // Load survey data (works with both recipient tokens and public links)
  const { data: surveyData, isLoading, error } = useQuery<SurveyData>({
    queryKey: ["/api/survey-by-identifier", identifier],
    queryFn: async () => {
      // Use the unified endpoint that auto-detects token vs public link
      const endpoint = `/api/survey/${identifier}`;

      const response = await fetch(endpoint);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Survey not found: ${response.status}`);
      }
      const data = await response.json();

      // Debug logging
      console.log('[SurveyPlayer] Survey data received:', {
        surveyTitle: data.survey?.title,
        pagesCount: data.pages?.length,
        firstPage: data.pages?.[0],
        firstPageQuestions: data.pages?.[0]?.questions?.map((q: any) => ({
          id: q.id,
          title: q.title,
          type: q.type
        }))
      });

      return data;
    },
    retry: false,
  });

  // Load conditional rules
  const { data: conditionalRules = [] } = useQuery<ConditionalRule[]>({
    queryKey: ["/api/surveys", surveyData?.survey?.id, "conditional-rules"],
    enabled: !!surveyData?.survey?.id,
    retry: false,
  });

  // Set anonymous state and create response when survey loads
  useEffect(() => {
    if (surveyData) {
      setIsAnonymous(!!surveyData.anonymous);

      // Create response immediately when survey loads (don't wait for first answer)
      // This ensures we always have a responseId before submission
      if (!responseId && !isSubmitted) {
        createResponseMutation.mutate();
      }
    }
  }, [surveyData]);

  // Create response mutation
  const createResponseMutation = useMutation({
    mutationFn: async () => {
      if (!surveyData?.survey?.id) {
        throw new Error("Survey data not loaded");
      }

      // Check surveyData.anonymous directly (not isAnonymous state which may not be updated yet)
      const isAnonymousSurvey = !!surveyData.anonymous;

      if (isAnonymousSurvey) {
        // Anonymous response (using public link)
        const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSessionId(newSessionId);

        return await apiRequest("POST", `/api/surveys/${identifier}/responses`, {
          sessionId: newSessionId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screenResolution: `${screen.width}x${screen.height}`
        });
      } else {
        // Authenticated response (using recipient token)
        return await apiRequest("POST", `/api/surveys/${surveyData.survey.id}/responses`, {
          token: identifier
        });
      }
    },
    onSuccess: async (response) => {
      const data = await response.json();
      setResponseId(data.responseId || data.id);
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }
      setSurveyStartTime(Date.now());
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start response. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create answer mutation
  const createAnswerMutation = useMutation({
    mutationFn: async ({ questionId, value }: { questionId: string; value: any }) => {
      if (!responseId) throw new Error("No response ID available");
      return await apiRequest("POST", `/api/responses/${responseId}/answers`, {
        questionId,
        value: typeof value === 'object' ? value : { text: value }
      });
    },
    onSuccess: async (response, variables) => {
      const data = await response.json();
      setAnswerIds(prev => ({
        ...prev,
        [variables.questionId]: data.id
      }));
    },
  });

  // Submit response mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!responseId) throw new Error("No response ID available");
      return await apiRequest("PUT", `/api/responses/${responseId}/complete`, {});
    },
    onSuccess: async () => {
      setIsSubmitted(true);
      toast({
        title: "Success",
        description: "Your response has been submitted successfully!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to submit response. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Save pending answers helper
  const savePendingAnswers = async () => {
    if (!responseId) return;

    const pendingAnswers = Object.entries(answers).filter(([questionId]) => !answerIds[questionId]);
    const pages = surveyData?.pages || [];

    for (const [questionId, value] of pendingAnswers) {
      const question = pages.flatMap(p => p.questions || []).find(q => q.id === questionId);

      if (question?.type === 'loop_group' && Array.isArray(value)) {
        for (let loopIndex = 0; loopIndex < value.length; loopIndex++) {
          const instance = value[loopIndex];
          if (instance.answers && question.subquestions) {
            for (const subquestion of question.subquestions) {
              const subAnswer = instance.answers[subquestion.id];
              if (subAnswer !== undefined && subAnswer !== null && subAnswer !== "") {
                await apiRequest("POST", `/api/responses/${responseId}/answers`, {
                  questionId: questionId,
                  subquestionId: subquestion.id,
                  loopIndex: loopIndex,
                  value: typeof subAnswer === 'object' ? subAnswer : { text: subAnswer }
                });
              }
            }
          }
        }
      } else if (value !== undefined && value !== null && value !== "") {
        await apiRequest("POST", `/api/responses/${responseId}/answers`, {
          questionId,
          value: typeof value === 'object' ? value : { text: value }
        });
      }
    }
  };

  return {
    // State
    currentPageIndex,
    setCurrentPageIndex,
    answers,
    setAnswers,
    answerIds,
    responseId,
    sessionId,
    isSubmitted,
    isAnonymous,
    surveyStartTime,

    // Data
    surveyData,
    conditionalRules,
    isLoading,
    error,

    // Mutations
    createResponse: createResponseMutation.mutate,
    isCreatingResponse: createResponseMutation.isPending,
    createAnswer: createAnswerMutation.mutate,
    submitResponse: submitMutation.mutateAsync,
    submitPending: submitMutation.isPending,

    // Helpers
    savePendingAnswers,
  };
}
