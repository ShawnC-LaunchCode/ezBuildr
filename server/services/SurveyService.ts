import {
  surveyRepository,
  pageRepository,
  questionRepository,
  userRepository,
  type DbTransaction
} from "../repositories";
import type {
  Survey,
  InsertSurvey,
  AnonymousSurveyConfig
} from "@shared/schema";
import { validateSurveyForPublish, canChangeStatus } from "./surveyValidation";
import { logger } from "../logger";

/**
 * Service layer for survey-related business logic
 * Orchestrates repository calls, handles authorization, and enforces business rules
 */
export class SurveyService {
  private surveyRepo: typeof surveyRepository;
  private pageRepo: typeof pageRepository;
  private questionRepo: typeof questionRepository;
  private userRepo: typeof userRepository;

  constructor(
    surveyRepo?: typeof surveyRepository,
    pageRepo?: typeof pageRepository,
    questionRepo?: typeof questionRepository,
    userRepo?: typeof userRepository
  ) {
    this.surveyRepo = surveyRepo || surveyRepository;
    this.pageRepo = pageRepo || pageRepository;
    this.questionRepo = questionRepo || questionRepository;
    this.userRepo = userRepo || userRepository;
  }

  /**
   * Verify user owns the survey (admins can access any survey)
   */
  async verifyOwnership(surveyId: string, userId: string): Promise<Survey> {
    const survey = await this.surveyRepo.findById(surveyId);

    if (!survey) {
      throw new Error("Survey not found");
    }

    // Check if user is an admin
    const user = await this.userRepo.findById(userId);
    if (user && user.role === 'admin') {
      // Admins can access any survey
      return survey;
    }

    if (survey.creatorId !== userId) {
      throw new Error("Access denied - you do not own this survey");
    }

    return survey;
  }

  /**
   * Create a new survey with a default first page
   */
  async createSurvey(data: InsertSurvey, creatorId: string): Promise<Survey> {
    return await this.surveyRepo.transaction(async (tx) => {
      // Create survey
      const survey = await this.surveyRepo.create(
        {
          ...data,
          creatorId,
          status: 'draft'
        },
        tx
      );

      // Create default first page
      await this.pageRepo.create(
        {
          surveyId: survey.id,
          title: 'Page 1',
          order: 1
        },
        tx
      );

      return survey;
    });
  }

  /**
   * Get survey by ID (no ownership check)
   */
  async getSurvey(surveyId: string): Promise<Survey | undefined> {
    return await this.surveyRepo.findById(surveyId);
  }

  /**
   * Get survey by ID with ownership check
   */
  async getSurveyForUser(surveyId: string, userId: string): Promise<Survey> {
    return await this.verifyOwnership(surveyId, userId);
  }

  /**
   * Get all surveys for a creator
   */
  async getSurveysByCreator(creatorId: string): Promise<Survey[]> {
    return await this.surveyRepo.findByCreator(creatorId);
  }

  /**
   * Update survey with ownership check
   */
  async updateSurvey(
    surveyId: string,
    userId: string,
    updates: Partial<InsertSurvey>
  ): Promise<Survey> {
    // Verify ownership
    await this.verifyOwnership(surveyId, userId);

    // If enabling anonymous access and publicLink doesn't exist, generate one
    if (updates.allowAnonymous) {
      const existingSurvey = await this.surveyRepo.findById(surveyId);
      if (existingSurvey && !existingSurvey.publicLink) {
        const { randomUUID } = await import('crypto');
        (updates as any).publicLink = randomUUID();
      }
    }

    // Update survey
    return await this.surveyRepo.update(surveyId, updates);
  }

  /**
   * Delete survey with ownership check
   */
  async deleteSurvey(surveyId: string, userId: string): Promise<void> {
    // Verify ownership
    await this.verifyOwnership(surveyId, userId);

    // Delete survey (cascade will handle related data)
    await this.surveyRepo.delete(surveyId);
  }

  /**
   * Validate survey for publishing
   */
  async validateForPublish(surveyId: string, userId: string) {
    // Verify ownership
    await this.verifyOwnership(surveyId, userId);

    // Run validation
    return await validateSurveyForPublish(surveyId);
  }

  /**
   * Change survey status with validation
   */
  async changeStatus(
    surveyId: string,
    userId: string,
    newStatus: string
  ): Promise<{ survey: Survey; message: string }> {
    // Verify ownership
    const survey = await this.verifyOwnership(surveyId, userId);

    // Validate status value
    if (!['draft', 'open', 'closed'].includes(newStatus)) {
      throw new Error("Invalid status. Must be 'draft', 'open', or 'closed'");
    }

    // Check if status change is allowed
    const statusCheck = await canChangeStatus(surveyId, survey.status, newStatus);
    if (!statusCheck.allowed) {
      throw new Error(statusCheck.reason || "Status change not allowed");
    }

    // Update status
    const updatedSurvey = await this.surveyRepo.update(surveyId, { status: newStatus as any });

    return {
      survey: updatedSurvey,
      message: statusCheck.reason || "Status updated successfully"
    };
  }

  /**
   * Enable anonymous access for a survey
   */
  async enableAnonymousAccess(
    surveyId: string,
    userId: string,
    config: {
      accessType: string;
      anonymousConfig?: AnonymousSurveyConfig;
    }
  ): Promise<Survey> {
    // Verify ownership
    await this.verifyOwnership(surveyId, userId);

    // Enable anonymous access
    return await this.surveyRepo.enableAnonymousAccess(surveyId, config);
  }

  /**
   * Disable anonymous access for a survey
   */
  async disableAnonymousAccess(surveyId: string, userId: string): Promise<Survey> {
    // Verify ownership
    await this.verifyOwnership(surveyId, userId);

    // Disable anonymous access
    return await this.surveyRepo.disableAnonymousAccess(surveyId);
  }

  /**
   * Duplicate a survey
   */
  async duplicateSurvey(
    surveyId: string,
    userId: string,
    newTitle: string
  ): Promise<Survey> {
    // Verify ownership of original survey
    await this.verifyOwnership(surveyId, userId);

    // Duplicate survey
    return await this.surveyRepo.duplicate(surveyId, newTitle, userId);
  }

  /**
   * Archive a survey (set status to 'closed')
   */
  async archiveSurvey(surveyId: string, userId: string): Promise<Survey> {
    // Verify ownership
    await this.verifyOwnership(surveyId, userId);

    // Archive survey
    return await this.surveyRepo.archive(surveyId, userId);
  }

  /**
   * Bulk update survey statuses
   */
  async bulkUpdateStatus(
    surveyIds: string[],
    status: string,
    userId: string
  ) {
    return await this.surveyRepo.bulkUpdateStatus(surveyIds, status, userId);
  }

  /**
   * Bulk delete surveys
   */
  async bulkDeleteSurveys(
    surveyIds: string[],
    userId: string
  ) {
    return await this.surveyRepo.bulkDelete(surveyIds, userId);
  }

  /**
   * Get survey by public link (for anonymous access)
   * Returns survey with pages and questions, validates anonymous access is enabled
   */
  async getSurveyByPublicLink(publicLink: string): Promise<{
    survey: Survey;
    pages: any[];
  }> {
    logger.info({ publicLink }, '[SurveyService] getSurveyByPublicLink called');

    // Look up survey by public link
    const survey = await this.surveyRepo.findByPublicLink(publicLink);

    if (!survey) {
      logger.info({ publicLink }, '[SurveyService] Survey not found for public link');
      throw new Error("Survey not found");
    }

    logger.info({
      id: survey.id,
      title: survey.title,
      status: survey.status,
      allowAnonymous: survey.allowAnonymous,
      publicLink: survey.publicLink
    }, '[SurveyService] Survey found');

    // Verify survey is open and allows anonymous access
    if (survey.status !== 'open') {
      logger.info({ status: survey.status }, '[SurveyService] Survey not open');
      throw new Error("Survey not available");
    }

    if (!survey.allowAnonymous) {
      logger.info({ allowAnonymous: survey.allowAnonymous }, '[SurveyService] Anonymous access not allowed');
      throw new Error("Survey not available");
    }

    logger.info('[SurveyService] Survey validation passed, fetching pages...');

    // Fetch pages with questions
    const pages = await this.pageRepo.findBySurvey(survey.id);

    logger.info({ pageCount: pages.length }, '[SurveyService] Pages fetched');

    // Fetch questions for each page
    const pagesWithQuestions = await Promise.all(
      pages.map(async (page) => {
        const pageQuestions = await this.questionRepo.findByPage(page.id);
        logger.info({
          pageId: page.id,
          questions: pageQuestions.map(q => ({
            id: q.id,
            title: q.title,
            type: q.type,
            description: q.description
          }))
        }, '[SurveyService] Questions for page');
        return {
          ...page,
          questions: pageQuestions
        };
      })
    );

    logger.info({ pageCount: pagesWithQuestions.length }, '[SurveyService] Returning survey data');
    logger.info({
      totalQuestions: pagesWithQuestions.reduce((sum, p: any) => sum + (p.questions?.length || 0), 0)
    }, '[SurveyService] Total questions across all pages');

    return {
      survey,
      pages: pagesWithQuestions
    };
  }
}

// Export singleton instance
export const surveyService = new SurveyService();
