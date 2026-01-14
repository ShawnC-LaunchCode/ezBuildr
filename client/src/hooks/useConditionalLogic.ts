import { useState, useEffect, useRef } from "react";

import { evaluatePageConditionalLogic } from "@shared/conditionalLogic";
import type { ConditionalRule, QuestionWithSubquestions } from "@shared/schema";

export function useConditionalLogic(
  conditionalRules: ConditionalRule[],
  answers: Record<string, any>,
  currentPageQuestions: QuestionWithSubquestions[] | undefined
) {
  const [visibleQuestions, setVisibleQuestions] = useState<Record<string, boolean>>({});
  const previousQuestionsRef = useRef<string>("");

  useEffect(() => {
    // Create a stable key from current questions to detect actual changes
    const currentQuestionsKey = currentPageQuestions?.map(q => q.id).sort().join(',') || '';

    // If questions haven't changed and we already have visibility data, skip
    if (currentQuestionsKey === previousQuestionsRef.current && Object.keys(visibleQuestions).length > 0) {
      return;
    }

    previousQuestionsRef.current = currentQuestionsKey;

    if (!currentPageQuestions || currentPageQuestions.length === 0) {
      setVisibleQuestions({});
      return;
    }

    if (conditionalRules.length === 0) {
      // If no rules, all questions are visible
      const allVisible: Record<string, boolean> = {};
      currentPageQuestions.forEach(q => {
        allVisible[q.id] = true;
      });
      setVisibleQuestions(allVisible);
      return;
    }

    // Evaluate conditional rules
    const evaluationResults = evaluatePageConditionalLogic(conditionalRules, answers);

    // Set all questions as visible by default
    const newVisibility: Record<string, boolean> = {};
    currentPageQuestions.forEach(question => {
      newVisibility[question.id] = true;
    });

    // Apply conditional logic results
    evaluationResults.forEach(result => {
      newVisibility[result.questionId] = result.visible;
    });

    // Only update if visibility actually changed
    const hasChanged = JSON.stringify(newVisibility) !== JSON.stringify(visibleQuestions);
    if (hasChanged) {
      setVisibleQuestions(newVisibility);
    }
  }, [answers, conditionalRules, currentPageQuestions, visibleQuestions]);

  return { visibleQuestions };
}
