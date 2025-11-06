import { BaseRepository, type DbTransaction } from "./BaseRepository";
import {
  responses,
  answers,
  questions,
  anonymousResponseTracking,
  type Response,
  type InsertResponse,
  type Answer,
  type InsertAnswer,
  type Question,
  type AnonymousResponseTracking,
  type InsertAnonymousResponseTracking,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

/**
 * Repository for response and answer-related database operations
 * Handles response collection, answers, and anonymous response tracking
 */
export class ResponseRepository extends BaseRepository<typeof responses, Response, InsertResponse> {
  constructor() {
    super(responses);
  }

  // ==================== Response Operations ====================

  /**
   * Find responses by survey ID (ordered)
   */
  async findBySurvey(surveyId: string, tx?: DbTransaction): Promise<Response[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(responses)
      .where(eq(responses.surveyId, surveyId))
      .orderBy(desc(responses.createdAt));
  }

  /**
   * Find anonymous responses by survey ID
   */
  async findAnonymousBySurvey(surveyId: string, tx?: DbTransaction): Promise<Response[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(responses)
      .where(and(eq(responses.surveyId, surveyId), eq(responses.isAnonymous, true)))
      .orderBy(desc(responses.createdAt));
  }

  /**
   * Count anonymous responses for a survey
   */
  async countAnonymousBySurvey(surveyId: string, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const result = await database
      .select({ count: sql<number>`count(*)` })
      .from(responses)
      .where(and(eq(responses.surveyId, surveyId), eq(responses.isAnonymous, true)));
    return Number(result[0]?.count || 0);
  }

  /**
   * Create anonymous response
   */
  async createAnonymousResponse(
    data: {
      surveyId: string;
      ipAddress: string;
      userAgent?: string;
      sessionId?: string;
      anonymousMetadata?: any;
    },
    tx?: DbTransaction
  ): Promise<Response> {
    const database = this.getDb(tx);
    const [newResponse] = await database
      .insert(responses)
      .values({
        surveyId: data.surveyId,
        recipientId: null,
        isAnonymous: true,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        sessionId: data.sessionId,
        anonymousMetadata: data.anonymousMetadata ? JSON.stringify(data.anonymousMetadata) : null,
        completed: false,
      } as any)
      .returning();
    return newResponse;
  }

  // ==================== Answer Operations ====================

  /**
   * Create answer
   */
  async createAnswer(answer: InsertAnswer, tx?: DbTransaction): Promise<Answer> {
    const database = this.getDb(tx);
    const [newAnswer] = await database
      .insert(answers)
      .values(answer as any)
      .returning();
    return newAnswer;
  }

  /**
   * Find answer by ID
   */
  async findAnswerById(id: string, tx?: DbTransaction): Promise<Answer | undefined> {
    const database = this.getDb(tx);
    const [answer] = await database.select().from(answers).where(eq(answers.id, id));
    return answer;
  }

  /**
   * Find answers by response ID
   */
  async findAnswersByResponse(responseId: string, tx?: DbTransaction): Promise<Answer[]> {
    const database = this.getDb(tx);
    return await database.select().from(answers).where(eq(answers.responseId, responseId));
  }

  /**
   * Find answers with questions by response ID
   */
  async findAnswersWithQuestionsByResponse(
    responseId: string,
    tx?: DbTransaction
  ): Promise<(Answer & { question: Question })[]> {
    const database = this.getDb(tx);
    const result = await database
      .select({
        id: answers.id,
        responseId: answers.responseId,
        questionId: answers.questionId,
        subquestionId: answers.subquestionId,
        loopIndex: answers.loopIndex,
        value: answers.value,
        createdAt: answers.createdAt,
        question: {
          id: questions.id,
          pageId: questions.pageId,
          type: questions.type,
          title: questions.title,
          description: questions.description,
          required: questions.required,
          options: questions.options,
          loopConfig: questions.loopConfig,
          conditionalLogic: questions.conditionalLogic,
          order: questions.order,
          createdAt: questions.createdAt,
        },
      })
      .from(answers)
      .innerJoin(questions, eq(answers.questionId, questions.id))
      .where(eq(answers.responseId, responseId))
      .orderBy(questions.order);

    return result.map((row: any) => ({
      id: row.id,
      responseId: row.responseId,
      questionId: row.questionId,
      subquestionId: row.subquestionId,
      loopIndex: row.loopIndex,
      value: row.value,
      createdAt: row.createdAt,
      question: row.question,
    }));
  }

  /**
   * Update answer
   */
  async updateAnswer(
    id: string,
    updates: Partial<InsertAnswer>,
    tx?: DbTransaction
  ): Promise<Answer> {
    const database = this.getDb(tx);
    const [updatedAnswer] = await database
      .update(answers)
      .set(updates as any)
      .where(eq(answers.id, id))
      .returning();
    return updatedAnswer;
  }

  // ==================== Anonymous Response Tracking ====================

  /**
   * Check anonymous response limit
   */
  async checkAnonymousLimit(
    surveyId: string,
    ipAddress: string,
    sessionId: string | undefined,
    accessType: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const database = this.getDb(tx);

    switch (accessType) {
      case 'unlimited':
        return true;

      case 'one_per_ip':
        const existingIPResponse = await database
          .select()
          .from(anonymousResponseTracking)
          .where(
            and(
              eq(anonymousResponseTracking.surveyId, surveyId),
              eq(anonymousResponseTracking.ipAddress, ipAddress)
            )
          )
          .limit(1);
        return existingIPResponse.length === 0;

      case 'one_per_session':
        if (!sessionId) return false;
        const existingSessionResponse = await database
          .select()
          .from(anonymousResponseTracking)
          .where(
            and(
              eq(anonymousResponseTracking.surveyId, surveyId),
              eq(anonymousResponseTracking.sessionId, sessionId)
            )
          )
          .limit(1);
        return existingSessionResponse.length === 0;

      default:
        return false;
    }
  }

  /**
   * Create anonymous response tracking record
   */
  async createAnonymousTracking(
    tracking: InsertAnonymousResponseTracking,
    tx?: DbTransaction
  ): Promise<AnonymousResponseTracking> {
    const database = this.getDb(tx);
    const [newTracking] = await database
      .insert(anonymousResponseTracking)
      .values(tracking as any)
      .returning();
    return newTracking;
  }
}

export const responseRepository = new ResponseRepository();
