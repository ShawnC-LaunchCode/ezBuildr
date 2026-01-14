import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

import type { SurveyPage, Question } from "@shared/schema";

/**
 * Hook for managing page and question CRUD operations in the block-based UI
 */
export function useBlockOperations(surveyId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ===== PAGE OPERATIONS =====

  const updatePageMutation = useMutation({
    mutationFn: async ({ pageId, data }: { pageId: string; data: Partial<SurveyPage> }) => {
      return apiRequest("PUT", `/api/surveys/${surveyId}/pages/${pageId}`, data);
    },
    onMutate: async ({ pageId, data }) => {
      // Cancel any outgoing refetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: ["/api/surveys", surveyId, "pages"] });

      // Snapshot the previous value for rollback
      const previousPages = queryClient.getQueryData(["/api/surveys", surveyId, "pages"]);

      // Optimistically update to the new value
      queryClient.setQueryData(["/api/surveys", surveyId, "pages"], (old: any) => {
        if (!old) {return old;}
        return old.map((page: SurveyPage) =>
          page.id === pageId ? { ...page, ...data } : page
        );
      });

      // Return a context object with the snapshotted value and mutation data
      return { previousPages, pageId, data };
    },
    onError: (error: Error, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousPages) {
        queryClient.setQueryData(["/api/surveys", surveyId, "pages"], context.previousPages);
      }
      toast({
        title: "Error",
        description: `Failed to update page: ${error.message}`,
        variant: "destructive",
      });
    },
    onSuccess: async (response, variables, context) => {
      // Wait for the mutation to fully settle, then update cache with server response
      try {
        const result = await response.json();
        // Update the cache with the actual server response
        queryClient.setQueryData(["/api/surveys", surveyId, "pages"], (old: any) => {
          if (!old) {return old;}
          return old.map((page: any) =>
            page.id === variables.pageId ? { ...page, ...result } : page
          );
        });
      } catch (e) {
        // If we can't parse response, the optimistic update is good enough
        console.warn("Could not parse page update response:", e);
      }
    },
  });

  const duplicatePageMutation = useMutation({
    mutationFn: async (pageId: string) => {
      return apiRequest("POST", `/api/pages/${pageId}/duplicate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId, "pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId] });
      toast({
        title: "Success",
        description: "Page duplicated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to duplicate page: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // ===== QUESTION OPERATIONS =====

  const addQuestionMutation = useMutation({
    mutationFn: async ({ pageId, type }: { pageId: string; type: string }) => {
      return apiRequest("POST", `/api/pages/${pageId}/questions`, {
        type,
        title: `New ${type.replace("_", " ")} Question`,
        required: false,
        order: 999, // Server will auto-calculate correct order
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId, "pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId] });
      toast({
        title: "Success",
        description: "Question added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to add question: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateQuestionMutation = useMutation({
    mutationFn: async ({ questionId, data }: { questionId: string; data: Partial<Question> }) => {
      return apiRequest("PUT", `/api/questions/${questionId}`, data);
    },
    onMutate: async ({ questionId, data }) => {
      // Cancel any outgoing refetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: ["/api/surveys", surveyId, "pages"] });

      // Snapshot the previous value for rollback
      const previousPages = queryClient.getQueryData(["/api/surveys", surveyId, "pages"]);

      // Optimistically update to the new value
      queryClient.setQueryData(["/api/surveys", surveyId, "pages"], (old: any) => {
        if (!old) {return old;}
        return old.map((page: any) => ({
          ...page,
          questions: page.questions?.map((question: Question) =>
            question.id === questionId ? { ...question, ...data } : question
          ) || [],
        }));
      });

      // Return a context object with the snapshotted value and mutation data
      return { previousPages, questionId, data };
    },
    onError: (error: Error, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousPages) {
        queryClient.setQueryData(["/api/surveys", surveyId, "pages"], context.previousPages);
      }
      toast({
        title: "Error",
        description: `Failed to update question: ${error.message}`,
        variant: "destructive",
      });
    },
    onSuccess: async (response, variables, context) => {
      // Wait for the mutation to fully settle, then update cache with server response
      // This ensures cache has the authoritative server data
      try {
        const result = await response.json();
        // Update the cache with the actual server response
        queryClient.setQueryData(["/api/surveys", surveyId, "pages"], (old: any) => {
          if (!old) {return old;}
          return old.map((page: any) => ({
            ...page,
            questions: page.questions?.map((question: Question) =>
              question.id === variables.questionId ? { ...question, ...result } : question
            ) || [],
          }));
        });
      } catch (e) {
        // If we can't parse response, the optimistic update is good enough
        console.warn("Could not parse question update response:", e);
      }
    },
  });

  const duplicateQuestionMutation = useMutation({
    mutationFn: async (questionId: string) => {
      return apiRequest("POST", `/api/questions/${questionId}/duplicate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId, "pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId] });
      toast({
        title: "Success",
        description: "Question duplicated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to duplicate question: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: string) => {
      return apiRequest("DELETE", `/api/questions/${questionId}`);
    },
    onMutate: async (questionId: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/surveys", surveyId, "pages"] });

      // Snapshot the previous value
      const previousPages = queryClient.getQueryData(["/api/surveys", surveyId, "pages"]);

      // Optimistically remove the question
      queryClient.setQueryData(["/api/surveys", surveyId, "pages"], (old: any) => {
        if (!old) {return old;}
        return old.map((page: any) => ({
          ...page,
          questions: page.questions?.filter((question: Question) => question.id !== questionId) || [],
        }));
      });

      // Return a context object with the snapshotted value
      return { previousPages };
    },
    onError: (error: Error, questionId, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousPages) {
        queryClient.setQueryData(["/api/surveys", surveyId, "pages"], context.previousPages);
      }
      toast({
        title: "Error",
        description: `Failed to delete question: ${error.message}`,
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId, "pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId] });
      toast({
        title: "Success",
        description: "Question deleted successfully",
      });
    },
  });

  // ===== HANDLER FUNCTIONS =====
  // Note: These are intentionally missing mutation dependencies to maintain stable references
  // The mutation.mutate function is always current and safe to call

  const handleUpdatePage = useCallback((pageId: string, data: Partial<SurveyPage>) => {
    updatePageMutation.mutate({ pageId, data });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopyPage = useCallback((pageId: string) => {
    duplicatePageMutation.mutate(pageId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddQuestion = useCallback((pageId: string, type: string) => {
    addQuestionMutation.mutate({ pageId, type });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdateQuestion = useCallback((questionId: string, data: Partial<Question>) => {
    if (import.meta.env.DEV) {
      console.log('[useBlockOperations] handleUpdateQuestion called', {
        questionId,
        data
      });
    }
    updateQuestionMutation.mutate({ questionId, data });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopyQuestion = useCallback((questionId: string) => {
    duplicateQuestionMutation.mutate(questionId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteQuestion = useCallback((questionId: string) => {
    if (confirm("Are you sure you want to delete this question?")) {
      deleteQuestionMutation.mutate(questionId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Mutations
    updatePageMutation,
    duplicatePageMutation,
    addQuestionMutation,
    updateQuestionMutation,
    duplicateQuestionMutation,
    deleteQuestionMutation,

    // Handlers
    handleUpdatePage,
    handleCopyPage,
    handleAddQuestion,
    handleUpdateQuestion,
    handleCopyQuestion,
    handleDeleteQuestion,
  };
}
