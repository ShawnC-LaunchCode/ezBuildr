import { describe, it, expect, beforeEach, vi } from "vitest";
import { ResponseService } from "../../../server/services/ResponseService";
import {
  createTestResponse,
  createTestCompletedResponse,
  createTestAnonymousResponse,
  createTestAnswer,
} from "../../factories/responseFactory";
import { createTestSurvey, createTestQuestion, createTestPage } from "../../factories/mockFactories";

describe("ResponseService", () => {
  let service: ResponseService;
  let mockResponseRepo: any;
  let mockSurveyRepo: any;
  let mockQuestionRepo: any;
  let mockRecipientRepo: any;
  let mockPageRepo: any;
  let mockSystemStatsRepo: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    mockResponseRepo = {
      create: vi.fn(),
      createAnonymousResponse: vi.fn(),
      findById: vi.fn(),
      findBySurvey: vi.fn(),
      findByRecipient: vi.fn(),
      update: vi.fn(),
      saveAnswer: vi.fn(),
      createAnswer: vi.fn(),
      updateAnswer: vi.fn(),
      checkAnonymousLimit: vi.fn().mockResolvedValue(true), // Default: can respond (not limited)
      findAnswersByResponse: vi.fn(),
      findAnswersWithQuestionsByResponse: vi.fn(),
      createAnonymousTracking: vi.fn(),
      transaction: vi.fn((callback) => callback()), // Mock transaction support
    };

    mockSurveyRepo = {
      findById: vi.fn(),
      findByPublicLink: vi.fn(),
    };

    mockQuestionRepo = {
      findBySurveyId: vi.fn(),
      findById: vi.fn(),
      findByPageWithSubquestions: vi.fn(), // For completeResponse validation
      findConditionalRulesBySurvey: vi.fn().mockResolvedValue([]), // Default: no conditional rules
      findSubquestionById: vi.fn(),
    };

    mockRecipientRepo = {
      findByToken: vi.fn(),
      findById: vi.fn(),
    };

    mockPageRepo = {
      findBySurveyId: vi.fn(),
      findBySurvey: vi.fn(),  // Alias for same functionality
      findById: vi.fn(),
    };

    mockSystemStatsRepo = {
      incrementResponsesCollected: vi.fn(),
    };

    service = new ResponseService(
      mockResponseRepo,
      mockSurveyRepo,
      mockQuestionRepo,
      mockRecipientRepo,
      mockPageRepo,
      mockSystemStatsRepo
    );
  });

  describe("createAuthenticatedResponse", () => {
    it("should create an authenticated response with valid token", async () => {
      const survey = createTestSurvey({ status: "open" });
      const recipient = {
        id: "recipient-123",
        surveyId: survey.id,
        email: "test@example.com",
        token: "valid-token",
      };
      const response = createTestResponse({
        surveyId: survey.id,
        recipientId: recipient.id,
        isAnonymous: false,
      });

      mockSurveyRepo.findById.mockResolvedValue(survey);
      mockRecipientRepo.findByToken.mockResolvedValue(recipient);
      mockResponseRepo.findByRecipient.mockResolvedValue(null);
      mockResponseRepo.create.mockResolvedValue(response);

      const result = await service.createAuthenticatedResponse(survey.id, "valid-token");

      expect(result.response.surveyId).toBe(survey.id);
      expect(result.response.isAnonymous).toBe(false);
      expect(mockResponseRepo.create).toHaveBeenCalled();
    });

    it("should throw error if survey is not open", async () => {
      const survey = createTestSurvey({ status: "draft" });

      mockSurveyRepo.findById.mockResolvedValue(survey);

      await expect(service.createAuthenticatedResponse(survey.id)).rejects.toThrow(
        "not currently open"
      );
    });

    it("should throw error if survey not found", async () => {
      mockSurveyRepo.findById.mockResolvedValue(null);

      await expect(service.createAuthenticatedResponse("non-existent")).rejects.toThrow(
        "Survey not found"
      );
    });

    it("should throw error if token is invalid", async () => {
      const survey = createTestSurvey({ status: "open" });

      mockSurveyRepo.findById.mockResolvedValue(survey);
      mockRecipientRepo.findByToken.mockResolvedValue(null);

      await expect(
        service.createAuthenticatedResponse(survey.id, "invalid-token")
      ).rejects.toThrow("Invalid token");
    });
  });

  describe("createAnonymousResponse", () => {
    it("should create anonymous response for public survey", async () => {
      const survey = createTestSurvey({
        status: "open",
        allowAnonymous: true,
        anonymousAccessType: "unlimited",
        publicLink: "public-123",
      });
      const response = createTestAnonymousResponse(survey.id, {
        ipAddress: "192.168.1.1",
      });

      mockSurveyRepo.findByPublicLink.mockResolvedValue(survey);
      mockResponseRepo.createAnonymousResponse.mockResolvedValue(response);

      const result = await service.createAnonymousResponse("public-123", {
        ipAddress: "192.168.1.1",
        userAgent: "Test Browser",
      });

      expect(result.response.isAnonymous).toBe(true);
      expect(result.response.ipAddress).toBe("192.168.1.1");
    });

    it("should enforce one_per_ip limit", async () => {
      const survey = createTestSurvey({
        status: "open",
        allowAnonymous: true,
        anonymousAccessType: "one_per_ip",
        publicLink: "public-123",
      });

      mockSurveyRepo.findByPublicLink.mockResolvedValue(survey);
      mockResponseRepo.checkAnonymousLimit.mockResolvedValue(false); // Cannot respond (limit reached)

      await expect(
        service.createAnonymousResponse("public-123", {
          ipAddress: "192.168.1.1",
          userAgent: "Test Browser",
        })
      ).rejects.toThrow("You have already responded to this survey from this IP address.");
    });

    it("should throw error if survey doesn't allow anonymous", async () => {
      const survey = createTestSurvey({
        status: "open",
        allowAnonymous: false,
        publicLink: "public-123",
      });

      mockSurveyRepo.findByPublicLink.mockResolvedValue(survey);

      await expect(
        service.createAnonymousResponse("public-123", {
          ipAddress: "192.168.1.1",
          userAgent: "Test Browser",
        })
      ).rejects.toThrow("Anonymous responses are not allowed");
    });
  });

  describe("submitAnswer", () => {
    it("should save a single answer", async () => {
      const survey = createTestSurvey();
      const response = createTestResponse({ surveyId: survey.id, completed: false });
      const page = createTestPage(survey.id, { id: "page-1" });
      const question = createTestQuestion("page-1", { id: "question-123" });
      const answerData = {
        questionId: question.id,
        value: { text: "My answer" },
      };

      mockResponseRepo.findById.mockResolvedValue(response);
      mockSurveyRepo.findById.mockResolvedValue(survey);
      mockQuestionRepo.findById.mockResolvedValue(question);
      mockPageRepo.findById.mockResolvedValue(page);
      mockResponseRepo.findAnswersByResponse.mockResolvedValue([]);
      mockResponseRepo.createAnswer.mockResolvedValue(
        createTestAnswer(response.id, question.id)
      );

      const result = await service.submitAnswer(response.id, answerData);

      expect(result.answer.questionId).toBe(question.id);
      expect(result.isUpdate).toBe(false);
      expect(mockResponseRepo.createAnswer).toHaveBeenCalled();
    });

    it("should throw error if response is already completed", async () => {
      const response = createTestCompletedResponse("survey-123");

      mockResponseRepo.findById.mockResolvedValue(response);

      await expect(
        service.submitAnswer({
          responseId: response.id,
          questionId: "question-123",
          value: { text: "Late answer" },
        })
      ).rejects.toThrow("Cannot modify a completed response");
    });

    it("should throw error if response not found", async () => {
      mockResponseRepo.findById.mockResolvedValue(null);

      await expect(
        service.submitAnswer({
          responseId: "non-existent",
          questionId: "question-123",
          value: { text: "Answer" },
        })
      ).rejects.toThrow("Response not found");
    });
  });

  describe("completeResponse", () => {
    it("should mark response as complete after validation", async () => {
      const survey = createTestSurvey();
      const page = createTestPage(survey.id);
      const questions = [
        createTestQuestion(page.id, { id: "q1", required: true }),
        createTestQuestion(page.id, { id: "q2", required: false }),
      ];
      const response = createTestResponse({ surveyId: survey.id });
      const answers = [createTestAnswer(response.id, "q1")];

      mockResponseRepo.findById.mockResolvedValue({
        ...response,
        survey,
        answers,
      });
      mockSurveyRepo.findById.mockResolvedValue(survey);
      mockPageRepo.findBySurvey.mockResolvedValue([page]);
      mockQuestionRepo.findByPageWithSubquestions.mockResolvedValue(questions);
      mockResponseRepo.findAnswersByResponse.mockResolvedValue(answers);
      mockResponseRepo.update.mockResolvedValue(
        createTestCompletedResponse(survey.id, { id: response.id })
      );

      const result = await service.completeResponse(response.id);

      expect(result.response.completed).toBe(true);
      expect(result.response.submittedAt).toBeDefined();
      expect(mockResponseRepo.update).toHaveBeenCalled();
    });

    it("should throw error if required questions are not answered", async () => {
      const survey = createTestSurvey();
      const page = createTestPage(survey.id);
      const questions = [
        createTestQuestion(page.id, { id: "q1", required: true }),
        createTestQuestion(page.id, { id: "q2", required: true }),
      ];
      const response = createTestResponse({ surveyId: survey.id });
      const answers = [createTestAnswer(response.id, "q1")]; // Missing q2

      mockResponseRepo.findById.mockResolvedValue({
        ...response,
        survey,
        answers,
      });
      mockSurveyRepo.findById.mockResolvedValue(survey);
      mockPageRepo.findBySurvey.mockResolvedValue([page]);
      mockQuestionRepo.findByPageWithSubquestions.mockResolvedValue(questions);
      mockResponseRepo.findAnswersByResponse.mockResolvedValue(answers);

      await expect(service.completeResponse(response.id)).rejects.toThrow(
        "Missing required questions"
      );
    });

    it("should skip validation for conditionally hidden questions", async () => {
      const survey = createTestSurvey();
      const page = createTestPage(survey.id);
      const questions = [
        createTestQuestion(page.id, { id: "q1", required: false }),
        createTestQuestion(page.id, { id: "q2", required: true, title: "Question 2" }),
        createTestQuestion(page.id, { id: "q3", required: true, title: "Question 3" }),
      ];
      const response = createTestResponse({ surveyId: survey.id });
      // q1 answered "no", q2 not answered (but should be hidden), q3 answered
      const answers = [
        createTestAnswer(response.id, "q1", { value: "no" }),
        createTestAnswer(response.id, "q3"),
      ];

      // Conditional rule: show q2 only if q1 equals "yes"
      const conditionalRules = [
        {
          id: "rule1",
          surveyId: survey.id,
          conditionQuestionId: "q1",
          operator: "equals" as const,
          conditionValue: "yes",
          action: "show" as const,
          targetQuestionId: "q2",
          logicalOperator: "AND",
          order: 1,
          createdAt: new Date(),
        },
      ];

      mockResponseRepo.findById.mockResolvedValue({
        ...response,
        survey,
        answers,
      });
      mockSurveyRepo.findById.mockResolvedValue(survey);
      mockPageRepo.findBySurvey.mockResolvedValue([page]);
      mockQuestionRepo.findByPageWithSubquestions.mockResolvedValue(questions);
      mockQuestionRepo.findConditionalRulesBySurvey.mockResolvedValue(conditionalRules);
      mockResponseRepo.findAnswersByResponse.mockResolvedValue(answers);
      mockResponseRepo.update.mockResolvedValue(
        createTestCompletedResponse(survey.id, { id: response.id })
      );

      // Should succeed because q2 is conditionally hidden (q1 != "yes")
      const result = await service.completeResponse(response.id);

      expect(result.response.completed).toBe(true);
      expect(mockResponseRepo.update).toHaveBeenCalled();
    });

    it("should enforce conditionally required questions", async () => {
      const survey = createTestSurvey();
      const page = createTestPage(survey.id);
      const questions = [
        createTestQuestion(page.id, { id: "q1", required: false }),
        createTestQuestion(page.id, { id: "q2", required: false, title: "Question 2" }),
      ];
      const response = createTestResponse({ surveyId: survey.id });
      // q1 answered "high", but q2 not answered (should be required conditionally)
      const answers = [
        createTestAnswer(response.id, "q1", { value: "high" }),
      ];

      // Conditional rule: require q2 if q1 equals "high"
      const conditionalRules = [
        {
          id: "rule1",
          surveyId: survey.id,
          conditionQuestionId: "q1",
          operator: "equals" as const,
          conditionValue: "high",
          action: "require" as const,
          targetQuestionId: "q2",
          logicalOperator: "AND",
          order: 1,
          createdAt: new Date(),
        },
      ];

      mockResponseRepo.findById.mockResolvedValue({
        ...response,
        survey,
        answers,
      });
      mockSurveyRepo.findById.mockResolvedValue(survey);
      mockPageRepo.findBySurvey.mockResolvedValue([page]);
      mockQuestionRepo.findByPageWithSubquestions.mockResolvedValue(questions);
      mockQuestionRepo.findConditionalRulesBySurvey.mockResolvedValue(conditionalRules);
      mockResponseRepo.findAnswersByResponse.mockResolvedValue(answers);

      // Should fail because q2 is conditionally required but not answered
      await expect(service.completeResponse(response.id)).rejects.toThrow(
        "Missing required questions: Question 2"
      );
    });
  });

  describe("getResponsesForSurvey", () => {
    it("should return all responses for a survey", async () => {
      const survey = createTestSurvey();
      const responses = Array.from({ length: 5 }, () =>
        createTestResponse({ surveyId: survey.id })
      );

      mockSurveyRepo.findById.mockResolvedValue(survey);
      mockResponseRepo.findBySurvey.mockResolvedValue(responses);

      const result = await service.getResponsesForSurvey(survey.id, survey.creatorId);

      expect(result).toHaveLength(5);
      expect(result.every((r) => r.surveyId === survey.id)).toBe(true);
    });

    it("should filter by completion status", async () => {
      const survey = createTestSurvey();
      const completedResponses = Array.from({ length: 3 }, () =>
        createTestCompletedResponse(survey.id)
      );

      mockSurveyRepo.findById.mockResolvedValue(survey);
      mockResponseRepo.findBySurvey.mockResolvedValue(completedResponses);

      const result = await service.getResponsesForSurvey(survey.id, survey.creatorId, true);

      expect(result).toHaveLength(3);
      expect(result.every((r) => r.completed === true)).toBe(true);
    });
  });

  describe("getResponseDetails", () => {
    it("should return response with answers and survey details", async () => {
      const survey = createTestSurvey();
      const response = createTestResponse({ surveyId: survey.id });
      const page = createTestPage(survey.id);
      const question1 = createTestQuestion(page.id, { id: "q1" });
      const question2 = createTestQuestion(page.id, { id: "q2" });
      const answersWithQuestions = [
        { ...createTestAnswer(response.id, "q1"), question: question1 },
        { ...createTestAnswer(response.id, "q2"), question: question2 },
      ];

      mockResponseRepo.findById.mockResolvedValue(response);
      mockSurveyRepo.findById.mockResolvedValue(survey);
      mockResponseRepo.findAnswersWithQuestionsByResponse.mockResolvedValue(answersWithQuestions);

      const result = await service.getResponseDetails(response.id, survey.creatorId);

      expect(result.response.id).toBe(response.id);
      expect(result.answers).toHaveLength(2);
      expect(result.answers[0].question).toBeDefined();
    });

    it("should throw error if response not found", async () => {
      mockResponseRepo.findById.mockResolvedValue(null);

      await expect(service.getResponseDetails("non-existent")).rejects.toThrow(
        "Response not found"
      );
    });
  });
});
