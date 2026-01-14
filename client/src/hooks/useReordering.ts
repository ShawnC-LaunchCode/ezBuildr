import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/**
 * Hook for reordering pages within a survey
 */
export function useReorderPages(surveyId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (pages: Array<{ id: string; order: number }>) => {
      return apiRequest("PUT", `/api/surveys/${surveyId}/pages/reorder`, {
        pages,
      });
    },
    onSuccess: () => {
      // Invalidate survey pages cache to refetch
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId, "pages"] });
      toast({
        title: "Success",
        description: "Pages reordered successfully",
      });
    },
    onError: (error: Error) => {
      console.error("Error reordering pages:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to reorder pages",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for reordering questions within a survey (supports cross-page moves)
 */
export function useReorderQuestions(surveyId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (questions: Array<{ id: string; pageId: string; order: number }>) => {
      return apiRequest("PUT", `/api/surveys/${surveyId}/questions/reorder`, {
        questions,
      });
    },
    onSuccess: () => {
      // Invalidate the pages cache which includes nested questions
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId, "pages"] });
      toast({
        title: "Success",
        description: "Questions reordered successfully",
      });
    },
    onError: (error: Error) => {
      console.error("Error reordering questions:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to reorder questions",
        variant: "destructive",
      });
    },
  });
}
