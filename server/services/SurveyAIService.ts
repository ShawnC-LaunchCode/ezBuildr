import { GoogleGenerativeAI } from "@google/generative-ai";
import { DEFAULT_SURVEY_GEN_PROMPT } from "../../shared/aiPromptConfig";
import {
  surveyRepository,
  pageRepository,
  questionRepository,
  type DbTransaction
} from "../repositories";
import { surveys, surveyPages, questions } from "@shared/schema";
import type { Survey, Question } from "@shared/schema";
import { logger } from "../logger";

type QuestionType = Question['type'];

type GenQuestion = {
  type: QuestionType;
  title: string;
  description?: string;
  options?: string[];
  required?: boolean;
};

type GenPage = {
  pageTitle: string;
  questions: GenQuestion[];
};

type GenSurvey = {
  title: string;
  description?: string;
  pages: GenPage[];
};

/**
 * Service for AI-powered survey generation using Google Gemini
 */
export class SurveyAIService {
  private surveyRepo: typeof surveyRepository;
  private pageRepo: typeof pageRepository;
  private questionRepo: typeof questionRepository;
  private modelName: string;

  constructor(
    surveyRepo?: typeof surveyRepository,
    pageRepo?: typeof pageRepository,
    questionRepo?: typeof questionRepository,
    modelName: string = "gemini-2.5-flash"
  ) {
    this.surveyRepo = surveyRepo || surveyRepository;
    this.pageRepo = pageRepo || pageRepository;
    this.questionRepo = questionRepo || questionRepository;
    this.modelName = modelName;
  }

  /**
   * Get configured Gemini model
   */
  private getModel() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: this.modelName });
  }

  /**
   * Parse and validate AI-generated survey data
   */
  private parseAndValidateResponse(text: string): GenSurvey {
    // Strip code fences if present
    const cleaned = text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error("AI returned invalid JSON. Please refine the topic and try again.");
    }

    // Validate and normalize structure
    if (!parsed.title || typeof parsed.title !== 'string') {
      throw new Error("AI response missing valid title");
    }

    if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) {
      throw new Error("AI response missing valid pages array");
    }

    // Validate question types
    const validTypes: QuestionType[] = [
      'short_text',
      'long_text',
      'multiple_choice',
      'radio',
      'yes_no',
      'date_time'
    ];

    // Normalize pages: ensure 3-4 questions per page
    parsed.pages = parsed.pages
      .map((p: any) => ({
        pageTitle: String(p.pageTitle || "General"),
        questions: (Array.isArray(p.questions) ? p.questions : [])
          .slice(0, 4) // Limit to 4 questions max
          .map((q: any) => {
            // Validate question type
            if (!validTypes.includes(q.type)) {
              throw new Error(`Invalid question type: ${q.type}`);
            }

            // Validate multiple_choice and radio have options
            if ((q.type === 'multiple_choice' || q.type === 'radio') &&
                (!Array.isArray(q.options) || q.options.length < 2)) {
              throw new Error(`Question type ${q.type} requires at least 2 options`);
            }

            return {
              type: q.type as QuestionType,
              title: String(q.title || "Untitled Question"),
              description: q.description ? String(q.description) : undefined,
              options: Array.isArray(q.options) ? q.options.map(String) : undefined,
              required: Boolean(q.required)
            };
          })
      }))
      .filter((p: GenPage) => p.questions.length > 0); // Remove empty pages

    if (parsed.pages.length === 0) {
      throw new Error("AI returned an empty questionnaire. Try a more specific topic.");
    }

    return {
      title: parsed.title,
      description: parsed.description ? String(parsed.description) : undefined,
      pages: parsed.pages
    };
  }

  /**
   * Generates a survey using AI and persists it as a draft
   * Returns the created survey with all pages and questions
   */
  async generateAndCreateSurvey(
    userId: string,
    topic: string,
    promptOverride?: string
  ): Promise<Survey> {
    if (!topic || !topic.trim()) {
      throw new Error("Topic is required");
    }

    const systemPrompt = (promptOverride && promptOverride.trim()) || DEFAULT_SURVEY_GEN_PROMPT;

    // Generate content with Gemini
    const model = this.getModel();
    const prompt = `${systemPrompt}\n\nTopic: ${topic}\n\nReturn JSON only.`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();

    // Parse and validate response
    const surveyData = this.parseAndValidateResponse(text);

    // Create survey with pages and questions in a transaction
    return await this.surveyRepo.transaction(async (tx) => {
      // Create survey
      const [survey] = await tx
        .insert(surveys)
        .values({
          title: surveyData.title,
          description: surveyData.description || "",
          creatorId: userId,
          status: 'draft' as any
        })
        .returning();

      logger.info({
        id: survey.id,
        title: survey.title,
        pageCount: surveyData.pages.length
      }, 'AI Survey created');

      // Create pages and questions
      let pageOrder = 1;
      for (const pageData of surveyData.pages) {
        const [page] = await tx
          .insert(surveyPages)
          .values({
            surveyId: survey.id,
            title: pageData.pageTitle,
            order: pageOrder++
          })
          .returning();

        logger.info({
          pageId: page.id,
          title: page.title,
          questionCount: pageData.questions.length
        }, 'Page created');

        // Create questions for this page
        let questionOrder = 1;
        for (const questionData of pageData.questions) {
          await tx
            .insert(questions)
            .values({
              pageId: page.id,
              type: questionData.type as any,
              title: questionData.title,
              description: questionData.description || "",
              required: questionData.required || false,
              options: questionData.options || null,
              order: questionOrder++
            });
        }
      }

      return survey;
    });
  }
}
