import type { Page, APIRequestContext } from "@playwright/test";

/**
 * E2E Test Helpers for API interactions
 */

export type Survey = {
  id: string;
  title: string;
  description?: string;
  status: "draft" | "open" | "closed";
  allowAnonymous: boolean;
  publicLink?: string;
};

export type SurveyPage = {
  id: string;
  surveyId: string;
  title: string;
  order: number;
};

export type Question = {
  id: string;
  pageId: string;
  type: string;
  title: string;
  required: boolean;
  order: number;
  options?: any;
};

/**
 * Create a survey via API
 */
export async function createSurvey(
  page: Page,
  data: { title: string; description?: string; allowAnonymous?: boolean }
): Promise<Survey> {
  const response = await page.request.post("/api/surveys", {
    data: {
      title: data.title,
      description: data.description || "",
      allowAnonymous: data.allowAnonymous || false,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create survey: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Add a page to a survey via API
 */
export async function addSurveyPage(
  page: Page,
  surveyId: string,
  data: { title: string; order?: number }
): Promise<SurveyPage> {
  const response = await page.request.post(`/api/surveys/${surveyId}/pages`, {
    data: {
      title: data.title,
      order: data.order ?? 0,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to add page: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Add a question to a survey page via API
 */
export async function addQuestion(
  page: Page,
  surveyId: string,
  pageId: string,
  data: {
    type: string;
    title: string;
    required?: boolean;
    options?: any;
    order?: number;
  }
): Promise<Question> {
  const response = await page.request.post(
    `/api/surveys/${surveyId}/pages/${pageId}/questions`,
    {
      data: {
        type: data.type,
        title: data.title,
        required: data.required ?? false,
        options: data.options,
        order: data.order ?? 0,
      },
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to add question: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Update survey status via API
 */
export async function updateSurveyStatus(
  page: Page,
  surveyId: string,
  status: "draft" | "open" | "closed"
): Promise<void> {
  const response = await page.request.put(`/api/surveys/${surveyId}/status`, {
    data: { status },
  });

  if (!response.ok()) {
    throw new Error(`Failed to update status: ${response.status()} ${await response.text()}`);
  }
}

/**
 * Create a complete survey with pages and questions for testing
 */
export async function createTestSurvey(page: Page): Promise<{
  survey: Survey;
  page1: SurveyPage;
  questions: Question[];
}> {
  const survey = await createSurvey(page, {
    title: "Test Survey",
    description: "Survey created for e2e testing",
    allowAnonymous: false,
  });

  const page1 = await addSurveyPage(page, survey.id, {
    title: "Page 1",
    order: 0,
  });

  const questions: Question[] = [];

  questions.push(
    await addQuestion(page, survey.id, page1.id, {
      type: "short_text",
      title: "What is your name?",
      required: true,
      order: 0,
    })
  );

  questions.push(
    await addQuestion(page, survey.id, page1.id, {
      type: "multiple_choice",
      title: "What are your interests?",
      required: false,
      options: ["Technology", "Sports", "Arts", "Science"],
      order: 1,
    })
  );

  return { survey, page1, questions };
}

/**
 * Create responses for a survey
 */
export async function createResponse(
  page: Page,
  surveyId: string,
  answers: Array<{ questionId: string; value: any }>
): Promise<string> {
  // Create response
  const createResponse = await page.request.post(`/api/surveys/${surveyId}/responses`, {
    data: {},
  });

  if (!createResponse.ok()) {
    throw new Error(
      `Failed to create response: ${createResponse.status()} ${await createResponse.text()}`
    );
  }

  const { id: responseId } = await createResponse.json();

  // Submit answers
  for (const answer of answers) {
    const submitAnswer = await page.request.post(`/api/responses/${responseId}/answers`, {
      data: {
        questionId: answer.questionId,
        value: answer.value,
      },
    });

    if (!submitAnswer.ok()) {
      throw new Error(
        `Failed to submit answer: ${submitAnswer.status()} ${await submitAnswer.text()}`
      );
    }
  }

  // Mark response as complete
  const completeResponse = await page.request.put(`/api/responses/${responseId}/complete`, {
    data: {},
  });

  if (!completeResponse.ok()) {
    throw new Error(
      `Failed to complete response: ${completeResponse.status()} ${await completeResponse.text()}`
    );
  }

  return responseId;
}

/**
 * Wait for an element with better timeout handling
 */
export async function waitForElement(
  page: Page,
  selector: string,
  options?: { timeout?: number; state?: "attached" | "detached" | "visible" | "hidden" }
) {
  return page.waitForSelector(selector, {
    timeout: options?.timeout ?? 10000,
    state: options?.state ?? "visible",
  });
}
