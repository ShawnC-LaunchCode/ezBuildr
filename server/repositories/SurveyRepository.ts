import { BaseRepository, type DbTransaction } from "./BaseRepository";
import {
  surveys,
  surveyPages,
  questions,
  type Survey,
  type InsertSurvey,
  type AnonymousSurveyConfig,
  type BulkOperationResult,
} from "@shared/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../logger";

/**
 * Repository for survey-related database operations
 * Handles survey CRUD, bulk operations, anonymous access, and duplication
 */
export class SurveyRepository extends BaseRepository<typeof surveys, Survey, InsertSurvey> {
  constructor() {
    super(surveys);
  }

  /**
   * Find surveys by creator ID
   */
  async findByCreator(creatorId: string, tx?: DbTransaction): Promise<Survey[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(surveys)
      .where(eq(surveys.creatorId, creatorId))
      .orderBy(desc(surveys.updatedAt));
  }

  /**
   * Find survey by public link
   */
  async findByPublicLink(publicLink: string, tx?: DbTransaction): Promise<Survey | undefined> {
    logger.info({ publicLink }, 'Looking up survey by public link');

    const database = this.getDb(tx);
    try {
      const [survey] = await database
        .select()
        .from(surveys)
        .where(eq(surveys.publicLink, publicLink));

      if (survey) {
        logger.info({
          id: survey.id,
          title: survey.title,
          publicLink: survey.publicLink,
          allowAnonymous: survey.allowAnonymous,
          status: survey.status,
        }, 'Found survey');
      } else {
        logger.info('No survey found for public link');
      }

      return survey;
    } catch (error) {
      logger.error({ err: error }, 'Error looking up survey by public link');
      throw error;
    }
  }

  /**
   * Create survey with logging and verification
   */
  async create(survey: InsertSurvey, tx?: DbTransaction): Promise<Survey> {
    logger.info({
      title: survey.title,
      creatorId: survey.creatorId,
      description: survey.description?.substring(0, 100),
    }, 'Creating survey');

    return await this.transaction(async (innerTx) => {
      try {
        const [newSurvey] = await innerTx
          .insert(surveys)
          .values(survey as any)
          .returning();

        logger.info({
          id: newSurvey.id,
          title: newSurvey.title,
          status: newSurvey.status,
        }, 'Survey created');

        // Verify the survey was actually saved
        const [verification] = await innerTx
          .select()
          .from(surveys)
          .where(eq(surveys.id, newSurvey.id));

        if (!verification) {
          logger.error({ surveyId: newSurvey.id }, 'CRITICAL: Survey not found immediately after creation!');
          throw new Error('Survey creation failed - survey not persisted');
        }

        logger.info('Survey creation verified successfully');
        return newSurvey;
      } catch (error) {
        logger.error({ err: error }, 'Error creating survey');
        throw error;
      }
    });
  }

  /**
   * Update survey with automatic updatedAt timestamp
   */
  async update(
    id: string,
    updates: Partial<InsertSurvey>,
    tx?: DbTransaction
  ): Promise<Survey> {
    const database = this.getDb(tx);
    const [updatedSurvey] = await database
      .update(surveys)
      .set(updates)
      .where(eq(surveys.id, id))
      .returning();
    return updatedSurvey;
  }

  /**
   * Generate a unique public link for a survey
   */
  async generatePublicLink(surveyId: string, tx?: DbTransaction): Promise<string> {
    const publicLink = randomUUID();
    await this.update(surveyId, { publicLink } as any, tx);
    return publicLink;
  }

  /**
   * Enable anonymous access for a survey
   */
  async enableAnonymousAccess(
    surveyId: string,
    config: { accessType: string; anonymousConfig?: AnonymousSurveyConfig },
    tx?: DbTransaction
  ): Promise<Survey> {
    logger.info({ surveyId }, 'Enabling anonymous access for survey');

    return await this.transaction(async (innerTx) => {
      const existingSurvey = await this.findById(surveyId, innerTx);
      if (!existingSurvey) {
        logger.error({ surveyId }, 'Survey not found');
        throw new Error('Survey not found');
      }

      logger.info({
        id: existingSurvey.id,
        title: existingSurvey.title,
        hasExistingPublicLink: !!existingSurvey.publicLink,
        allowAnonymous: existingSurvey.allowAnonymous,
      }, 'Survey exists');

      // If anonymous access is already enabled with a public link, update config only
      if (existingSurvey.allowAnonymous && existingSurvey.publicLink) {
        logger.info('Anonymous access already enabled, updating config only');

        const [updatedSurvey] = await innerTx
          .update(surveys)
          .set({
            anonymousAccessType: config.accessType as any,
            anonymousConfig: config.anonymousConfig ? JSON.stringify(config.anonymousConfig) : null,
          })
          .where(eq(surveys.id, surveyId))
          .returning();

        if (!updatedSurvey) {
          throw new Error('Survey configuration update failed');
        }

        logger.info('Anonymous access configuration updated');
        return updatedSurvey;
      }

      // Auto-publish draft surveys when enabling anonymous access
      const shouldPublish = existingSurvey.status === 'draft';
      if (shouldPublish) {
        logger.info('Auto-publishing draft survey for anonymous access');
      }

      // Generate new public link only if one doesn't exist
      const publicLink = existingSurvey.publicLink || randomUUID();
      logger.info({ isNew: !existingSurvey.publicLink, publicLink }, 'Using public link');

      try {
        const [updatedSurvey] = await innerTx
          .update(surveys)
          .set({
            allowAnonymous: true,
            anonymousAccessType: config.accessType as any,
            publicLink,
            status: shouldPublish ? 'open' : existingSurvey.status,
            anonymousConfig: config.anonymousConfig ? JSON.stringify(config.anonymousConfig) : null,
          })
          .where(eq(surveys.id, surveyId))
          .returning();

        if (!updatedSurvey) {
          throw new Error('Survey update failed');
        }

        logger.info({
          id: updatedSurvey.id,
          publicLink: updatedSurvey.publicLink,
          allowAnonymous: updatedSurvey.allowAnonymous,
          anonymousAccessType: updatedSurvey.anonymousAccessType,
          status: updatedSurvey.status,
          autoPublished: shouldPublish,
        }, 'Survey updated with anonymous access');

        // Verify the survey can be found by public link
        const [verification] = await innerTx
          .select()
          .from(surveys)
          .where(eq(surveys.publicLink, updatedSurvey.publicLink || ''));

        if (!verification) {
          logger.error({ publicLink: updatedSurvey.publicLink }, 'CRITICAL: Survey not findable by public link!');
          throw new Error('Anonymous access enablement failed');
        }

        logger.info('Anonymous access verified successfully');
        return updatedSurvey;
      } catch (error) {
        logger.error({ err: error }, 'Error enabling anonymous access');
        throw error;
      }
    });
  }

  /**
   * Disable anonymous access for a survey
   */
  async disableAnonymousAccess(surveyId: string, tx?: DbTransaction): Promise<Survey> {
    const database = this.getDb(tx);
    const [updatedSurvey] = await database
      .update(surveys)
      .set({
        allowAnonymous: false,
        anonymousAccessType: 'disabled',
        publicLink: null,
        anonymousConfig: null,
      })
      .where(eq(surveys.id, surveyId))
      .returning();

    if (!updatedSurvey) {
      throw new Error('Survey not found');
    }

    return updatedSurvey;
  }

  /**
   * Bulk update survey status
   */
  async bulkUpdateStatus(
    surveyIds: string[],
    status: string,
    creatorId: string,
    tx?: DbTransaction
  ): Promise<BulkOperationResult> {
    const database = this.getDb(tx);

    try {
      // Verify all surveys belong to the creator
      const foundSurveys = await database
        .select({ id: surveys.id })
        .from(surveys)
        .where(and(inArray(surveys.id, surveyIds), eq(surveys.creatorId, creatorId)));

      if (foundSurveys.length !== surveyIds.length) {
        return {
          success: false,
          updatedCount: 0,
          errors: ['Some surveys not found or access denied'],
        };
      }

      // Update survey statuses
      await database
        .update(surveys)
        .set({
          status: status as any,
        })
        .where(and(inArray(surveys.id, surveyIds), eq(surveys.creatorId, creatorId)));

      return {
        success: true,
        updatedCount: foundSurveys.length,
        errors: [],
      };
    } catch (error) {
      return {
        success: false,
        updatedCount: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Bulk delete surveys
   */
  async bulkDelete(
    surveyIds: string[],
    creatorId: string,
    tx?: DbTransaction
  ): Promise<BulkOperationResult> {
    const database = this.getDb(tx);

    try {
      // Verify all surveys belong to the creator
      const surveysToDelete = await database
        .select({ id: surveys.id })
        .from(surveys)
        .where(and(inArray(surveys.id, surveyIds), eq(surveys.creatorId, creatorId)));

      if (surveysToDelete.length !== surveyIds.length) {
        return {
          success: false,
          updatedCount: 0,
          errors: ['Some surveys not found or access denied'],
        };
      }

      // Delete surveys (cascade deletes handle related data)
      await database
        .delete(surveys)
        .where(and(inArray(surveys.id, surveyIds), eq(surveys.creatorId, creatorId)));

      return {
        success: true,
        updatedCount: surveysToDelete.length,
        errors: [],
      };
    } catch (error) {
      return {
        success: false,
        updatedCount: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Duplicate a survey (copy structure, not responses)
   */
  async duplicate(
    surveyId: string,
    newTitle: string,
    creatorId: string,
    tx?: DbTransaction
  ): Promise<Survey> {
    return await this.transaction(async (innerTx) => {
      const originalSurvey = await innerTx
        .select()
        .from(surveys)
        .where(and(eq(surveys.id, surveyId), eq(surveys.creatorId, creatorId)))
        .limit(1);

      if (!originalSurvey.length) {
        throw new Error('Survey not found or access denied');
      }

      const original = originalSurvey[0];

      // Create new survey
      const [newSurvey] = await innerTx
        .insert(surveys)
        .values({
          title: newTitle,
          description: original.description,
          creatorId,
          status: 'draft',
        })
        .returning();

      // Duplicate pages and questions
      const pages = await innerTx
        .select()
        .from(surveyPages)
        .where(eq(surveyPages.surveyId, surveyId))
        .orderBy(surveyPages.order);

      for (const page of pages) {
        const [newPage] = await innerTx
          .insert(surveyPages)
          .values({
            surveyId: newSurvey.id,
            title: page.title,
            order: page.order,
          })
          .returning();

        const pageQuestions = await innerTx
          .select()
          .from(questions)
          .where(eq(questions.pageId, page.id))
          .orderBy(questions.order);

        for (const question of pageQuestions) {
          await innerTx.insert(questions).values({
            pageId: newPage.id,
            type: question.type,
            title: question.title,
            description: question.description,
            required: question.required,
            options: question.options,
            order: question.order,
          });
        }
      }

      return newSurvey;
    });
  }

  /**
   * Archive survey (set status to closed)
   */
  async archive(surveyId: string, creatorId: string, tx?: DbTransaction): Promise<Survey> {
    const database = this.getDb(tx);
    const [archivedSurvey] = await database
      .update(surveys)
      .set({
        status: 'closed',
      })
      .where(and(eq(surveys.id, surveyId), eq(surveys.creatorId, creatorId)))
      .returning();

    if (!archivedSurvey) {
      throw new Error('Survey not found or access denied');
    }

    return archivedSurvey;
  }
}

export const surveyRepository = new SurveyRepository();
