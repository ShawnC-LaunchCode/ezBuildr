import {
  surveyRepository,
  responseRepository,
  questionRepository,
  pageRepository,
  systemStatsRepository,
  type DbTransaction
} from "../repositories";
import type {
  Response,
  InsertResponse,
  Answer,
  InsertAnswer,
  Question,
  ConditionalRule
} from "@shared/schema";
import { evaluateConditionalLogic, type EvaluationContext } from "@shared/conditionalLogic";

/**
 * Service layer for response-related business logic
 * Handles response creation, answer submission, and completion validation
 */
export class ResponseService {
  private responseRepo: typeof responseRepository;
  private surveyRepo: typeof surveyRepository;
  private questionRepo: typeof questionRepository;
  private pageRepo: typeof pageRepository;
  private systemStatsRepo: typeof systemStatsRepository;

  constructor(
    responseRepo?: typeof responseRepository,
    surveyRepo?: typeof surveyRepository,
    questionRepo?: typeof questionRepository,
    pageRepo?: typeof pageRepository,
    systemStatsRepo?: typeof systemStatsRepository
  ) {
    this.responseRepo = responseRepo || responseRepository;
    this.surveyRepo = surveyRepo || surveyRepository;
    this.questionRepo = questionRepo || questionRepository;
    this.pageRepo = pageRepo || pageRepository;
    this.systemStatsRepo = systemStatsRepo || systemStatsRepository;
  }

  /**
   * Create anonymous response with rate limiting
   */
  async createAnonymousResponse(
    publicLink: string,
    clientInfo: {
      ipAddress: string;
      userAgent: string;
      sessionId?: string;
      browserInfo?: any;
      deviceInfo?: any;
      accessInfo?: any;
    }
  ): Promise<{ response: Response; sessionId: string; message: string }> {
    const survey = await this.surveyRepo.findByPublicLink(publicLink);
    if (!survey) {
      throw new Error("Survey not found");
    }

    if (!survey.allowAnonymous) {
      throw new Error("Anonymous responses are not allowed for this survey");
    }

    if (survey.status !== 'open') {
      throw new Error("Survey is not currently open for responses");
    }

    // Generate session ID if not provided
    const sessionId = clientInfo.sessionId || `session_${Date.now()}_${Math.random().toString(36)}`;

    // Check rate limits
    const canRespond = await this.responseRepo.checkAnonymousLimit(
      survey.id,
      clientInfo.ipAddress,
      sessionId,
      survey.anonymousAccessType || 'disabled'
    );

    if (!canRespond) {
      const limitType = survey.anonymousAccessType === 'one_per_ip'
        ? 'IP address'
        : 'session';
      throw new Error(`You have already responded to this survey from this ${limitType}.`);
    }

    // Build anonymous metadata
    const anonymousMetadata = {
      browserInfo: clientInfo.browserInfo || {
        userAgent: clientInfo.userAgent,
      },
      deviceInfo: clientInfo.deviceInfo || {
        isMobile: /Mobile|Android|iPhone|iPad/i.test(clientInfo.userAgent),
      },
      accessInfo: clientInfo.accessInfo || {
        entryTime: Date.now()
      }
    };

    // Create anonymous response and tracking in transaction
    const response = await this.responseRepo.transaction(async (tx) => {
      const newResponse = await this.responseRepo.createAnonymousResponse(
        {
          surveyId: survey.id,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
          sessionId,
          anonymousMetadata
        },
        tx
      );

      await this.responseRepo.createAnonymousTracking(
        {
          surveyId: survey.id,
          ipAddress: clientInfo.ipAddress,
          sessionId,
          responseId: newResponse.id
        },
        tx
      );

      return newResponse;
    });

    // Increment system stats counter
    await this.systemStatsRepo.incrementResponsesCollected();

    return {
      response,
      sessionId,
      message: "Anonymous response created successfully"
    };
  }

  /**
   * Submit or update an answer
   */
  async submitAnswer(
    responseId: string,
    answerData: {
      questionId: string;
      subquestionId?: string | null;
      loopIndex?: number | null;
      value: any;
    }
  ): Promise<{ answer: Answer; isUpdate: boolean; message: string }> {
    // Validate response exists and is not completed
    const response = await this.responseRepo.findById(responseId);
    if (!response) {
      throw new Error("Response not found");
    }

    if (response.completed) {
      throw new Error("Cannot modify a completed response");
    }

    // Validate survey exists
    const survey = await this.surveyRepo.findById(response.surveyId);
    if (!survey) {
      throw new Error("Survey not found");
    }

    // Validate question exists and belongs to survey
    const question = await this.questionRepo.findById(answerData.questionId);
    if (!question) {
      throw new Error("Question not found");
    }

    const page = await this.pageRepo.findById(question.pageId);
    if (!page || page.surveyId !== survey.id) {
      throw new Error("Question does not belong to this survey");
    }

    // Validate subquestion if provided
    if (answerData.subquestionId) {
      const subquestion = await this.questionRepo.findSubquestionById(answerData.subquestionId);
      if (!subquestion || subquestion.loopQuestionId !== answerData.questionId) {
        throw new Error("Invalid subquestion for this question");
      }
    }

    // Check if answer already exists (upsert pattern)
    const existingAnswers = await this.responseRepo.findAnswersByResponse(responseId);
    const existingAnswer = existingAnswers.find(a =>
      a.questionId === answerData.questionId &&
      a.subquestionId === (answerData.subquestionId || null) &&
      a.loopIndex === (answerData.loopIndex || null)
    );

    let answer: Answer;
    let isUpdate = false;

    if (existingAnswer) {
      answer = await this.responseRepo.updateAnswer(existingAnswer.id, { value: answerData.value });
      isUpdate = true;
    } else {
      answer = await this.responseRepo.createAnswer({
        responseId,
        questionId: answerData.questionId,
        subquestionId: answerData.subquestionId || null,
        loopIndex: answerData.loopIndex || null,
        value: answerData.value
      });
    }

    return {
      answer,
      isUpdate,
      message: isUpdate ? "Answer updated successfully" : "Answer created successfully"
    };
  }

  /**
   * Complete a response with validation
   */
  async completeResponse(
    responseId: string
  ): Promise<{ response: Response; message: string }> {
    // Get response
    const response = await this.responseRepo.findById(responseId);
    if (!response) {
      throw new Error("Response not found");
    }

    if (response.completed) {
      throw new Error("Response is already completed");
    }

    // Get survey
    const survey = await this.surveyRepo.findById(response.surveyId);
    if (!survey) {
      throw new Error("Survey not found");
    }

    // Get all pages and questions
    const pages = await this.pageRepo.findBySurvey(survey.id);
    const answers = await this.responseRepo.findAnswersByResponse(responseId);

    // Build answer map
    const answersMap: Record<string, any> = {};
    answers.forEach(answer => {
      answersMap[answer.questionId] = answer.value;
    });

    // Get conditional rules for the survey
    const conditionalRules = await this.questionRepo.findConditionalRulesBySurvey(survey.id);

    // Build evaluation context for conditional logic
    const evaluationContext: EvaluationContext = {
      answers: new Map(Object.entries(answersMap)),
      conditions: conditionalRules
    };

    // Validate required questions are answered
    const missingRequired: string[] = [];

    for (const page of pages) {
      const questions = await this.questionRepo.findByPageWithSubquestions(page.id);

      for (const question of questions) {
        // Evaluate conditional logic for this question
        const conditionalEvaluation = evaluateConditionalLogic(question.id, evaluationContext);

        // Skip validation if question is conditionally hidden
        if (!conditionalEvaluation.visible) {
          continue;
        }

        // Check if question is required (either by default or conditionally)
        const isRequired = question.required || conditionalEvaluation.required;

        if (isRequired) {
          const hasAnswer = answers.some(a => a.questionId === question.id);
          if (!hasAnswer) {
            missingRequired.push(question.title);
          }
        }
      }
    }

    if (missingRequired.length > 0) {
      throw new Error(`Missing required questions: ${missingRequired.join(', ')}`);
    }

    // Mark as complete
    const updatedResponse = await this.responseRepo.update(responseId, {
      completed: true,
      submittedAt: new Date()
    });

    return {
      response: updatedResponse,
      message: "Response completed successfully"
    };
  }

  /**
   * Get responses for a survey (with ownership check)
   */
  async getResponsesForSurvey(
    surveyId: string,
    userId: string
  ): Promise<Response[]> {
    const survey = await this.surveyRepo.findById(surveyId);
    if (!survey) {
      throw new Error("Survey not found");
    }

    if (survey.creatorId !== userId) {
      throw new Error("Access denied - you do not own this survey");
    }

    return await this.responseRepo.findBySurvey(surveyId);
  }

  /**
   * Get single response with answers (with ownership check)
   */
  async getResponseDetails(
    responseId: string,
    userId: string
  ): Promise<{
    response: Response;
    answers: (Answer & { question: Question })[];
  }> {
    const response = await this.responseRepo.findById(responseId);
    if (!response) {
      throw new Error("Response not found");
    }

    const survey = await this.surveyRepo.findById(response.surveyId);
    if (!survey) {
      throw new Error("Survey not found");
    }

    if (survey.creatorId !== userId) {
      throw new Error("Access denied - you do not own this survey");
    }

    const answersWithQuestions = await this.responseRepo.findAnswersWithQuestionsByResponse(responseId);

    return {
      response,
      answers: answersWithQuestions
    };
  }
}

// Export singleton instance
export const responseService = new ResponseService();
