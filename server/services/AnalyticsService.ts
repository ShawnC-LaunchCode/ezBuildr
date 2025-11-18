// Legacy survey repositories - DISABLED (survey system removed Nov 2025)
import {
  // surveyRepository,
  // responseRepository,
  // pageRepository,
  // questionRepository,
  analyticsRepository
} from "../repositories";
import type {
  Survey,
  Response,
  QuestionWithSubquestions,
  DashboardStats,
  ActivityItem,
  SurveyAnalytics,
  ResponseTrend,
  QuestionAnalytics,
  PageAnalytics,
  CompletionFunnelData,
  TimeSpentData,
  EngagementMetrics
} from "@shared/schema";
import { db } from "../db";
import { surveys, responses, analyticsEvents, surveyPages, questions, answers } from "@shared/schema";
import { eq, desc, and, count, sql, gte } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * Service layer for analytics and reporting
 * Handles survey results compilation, question breakdowns, and analytics aggregation
 */
export class AnalyticsService {
  private analyticsRepo: typeof analyticsRepository;
  // Legacy survey repositories - DISABLED (survey system removed Nov 2025)
  // private responseRepo: typeof responseRepository;
  // private surveyRepo: typeof surveyRepository;
  // private questionRepo: typeof questionRepository;
  // private pageRepo: typeof pageRepository;

  constructor(
    analyticsRepo?: typeof analyticsRepository,
    // Legacy survey repositories - DISABLED
    // responseRepo?: typeof responseRepository,
    // surveyRepo?: typeof surveyRepository,
    // questionRepo?: typeof questionRepository,
    // pageRepo?: typeof pageRepository
  ) {
    this.analyticsRepo = analyticsRepo || analyticsRepository;
    // this.responseRepo = responseRepo || responseRepository;
    // this.surveyRepo = surveyRepo || surveyRepository;
    // this.questionRepo = questionRepo || questionRepository;
    // this.pageRepo = pageRepo || pageRepository;
  }

  /**
   * Get comprehensive survey results with question breakdowns
   */
  async getSurveyResults(surveyId: string, userId: string): Promise<{
    survey: Survey;
    stats: {
      totalResponses: number;
      completedResponses: number;
      completionRate: number;
    };
    questionBreakdown: Record<string, any>;
  }> {
    // Verify ownership
    const survey = await this.surveyRepo.findById(surveyId);
    if (!survey) {
      throw new Error("Survey not found");
    }

    if (survey.creatorId !== userId) {
      throw new Error("Access denied - you do not own this survey");
    }

    // Get responses
    const responses = await this.responseRepo.findBySurvey(surveyId);
    const completedResponses = responses.filter(r => r.completed);

    const totalResponses = responses.length;
    const completedCount = completedResponses.length;
    const completionRate = totalResponses > 0 ? (completedCount / totalResponses) * 100 : 0;

    // Get all questions
    const pages = await this.pageRepo.findBySurvey(surveyId);
    const allQuestions: QuestionWithSubquestions[] = [];

    for (const page of pages) {
      const questions = await this.questionRepo.findByPageWithSubquestions(page.id);
      allQuestions.push(...questions);
    }

    // Build question breakdown
    const questionBreakdown: Record<string, any> = {};

    for (const question of allQuestions) {
      questionBreakdown[question.id] = {
        questionId: question.id,
        questionTitle: question.title,
        questionType: question.type,
        totalResponses: 0,
        answers: [],
        breakdown: {}
      };

      for (const response of completedResponses) {
        const answers = await this.responseRepo.findAnswersByResponse(response.id);
        const questionAnswers = answers.filter(a => a.questionId === question.id);

        if (questionAnswers.length > 0) {
          questionBreakdown[question.id].totalResponses++;

          for (const answer of questionAnswers) {
            // Handle multiple choice and radio questions
            if (question.type === 'multiple_choice' || question.type === 'radio') {
              const value = answer.value;
              let selectedOptions: string[] = [];

              if (Array.isArray(value)) {
                selectedOptions = value;
              } else if (typeof value === 'object' && value !== null) {
                const valueObj = value as Record<string, any>;
                if (valueObj.text) {
                  selectedOptions = Array.isArray(valueObj.text) ? valueObj.text : [valueObj.text];
                } else if (valueObj.selected) {
                  selectedOptions = Array.isArray(valueObj.selected)
                    ? valueObj.selected
                    : [valueObj.selected];
                }
              } else if (typeof value === 'string') {
                selectedOptions = [value];
              }

              selectedOptions.forEach(option => {
                const optionStr = String(option);
                questionBreakdown[question.id].breakdown[optionStr] =
                  (questionBreakdown[question.id].breakdown[optionStr] || 0) + 1;
              });

            // Handle yes/no questions
            } else if (question.type === 'yes_no') {
              const value = answer.value;
              let boolValue: string;

              if (typeof value === 'boolean') {
                boolValue = value ? 'Yes' : 'No';
              } else if (typeof value === 'object' && value !== null) {
                const valueObj = value as Record<string, any>;
                boolValue =
                  valueObj.text === true || valueObj.text === 'true' || valueObj.text === 'Yes'
                    ? 'Yes'
                    : 'No';
              } else {
                boolValue =
                  String(value) === 'true' || String(value) === 'Yes' ? 'Yes' : 'No';
              }

              questionBreakdown[question.id].breakdown[boolValue] =
                (questionBreakdown[question.id].breakdown[boolValue] || 0) + 1;
            }
          }
        }
      }
    }

    return {
      survey,
      stats: {
        totalResponses,
        completedResponses: completedCount,
        completionRate: Math.round(completionRate * 100) / 100
      },
      questionBreakdown
    };
  }

  /**
   * Get question-level analytics
   */
  async getQuestionAnalytics(surveyId: string, userId: string): Promise<QuestionAnalytics[]> {
    // Verify ownership
    const survey = await this.surveyRepo.findById(surveyId);
    if (!survey) {
      throw new Error("Survey not found");
    }

    if (survey.creatorId !== userId) {
      throw new Error("Access denied - you do not own this survey");
    }

    // Count total responses for this survey
    const [totalResponsesResult] = await db
      .select({ count: count() })
      .from(responses)
      .where(eq(responses.surveyId, surveyId));

    const totalResponses = totalResponsesResult.count;

    // Get all questions for this survey
    const surveyQuestions = await db
      .select({
        questionId: questions.id,
        questionTitle: questions.title,
        questionType: questions.type,
        pageId: questions.pageId,
      })
      .from(questions)
      .innerJoin(surveyPages, eq(questions.pageId, surveyPages.id))
      .where(eq(surveyPages.surveyId, surveyId));

    // Get aggregates from analyticsRepository for all questions
    const aggregatesData = await this.analyticsRepo.getQuestionAggregates(surveyId);

    const analytics: QuestionAnalytics[] = [];

    for (const question of surveyQuestions) {
      // Count views (question_focus events)
      const [viewsResult] = await db
        .select({ count: count() })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.surveyId, surveyId),
            eq(analyticsEvents.questionId, question.questionId),
            eq(analyticsEvents.event, 'question_focus')
          )
        );

      // Count answers from analytics events
      const [analyticsAnswersResult] = await db
        .select({ count: count() })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.surveyId, surveyId),
            eq(analyticsEvents.questionId, question.questionId),
            eq(analyticsEvents.event, 'question_answer')
          )
        );

      // Count actual answers from answers table (fallback if analytics events don't exist)
      const [actualAnswersResult] = await db
        .select({ count: count() })
        .from(answers)
        .innerJoin(responses, eq(answers.responseId, responses.id))
        .where(
          and(
            eq(responses.surveyId, surveyId),
            eq(answers.questionId, question.questionId)
          )
        );

      // Count skips
      const [skipsResult] = await db
        .select({ count: count() })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.surveyId, surveyId),
            eq(analyticsEvents.questionId, question.questionId),
            eq(analyticsEvents.event, 'question_skip')
          )
        );

      // Calculate average time spent
      const timeEvents = await db
        .select({ duration: analyticsEvents.duration })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.surveyId, surveyId),
            eq(analyticsEvents.questionId, question.questionId),
            sql`duration IS NOT NULL`
          )
        );

      // Use actual answers from database if analytics events don't exist
      const totalAnswers = Math.max(analyticsAnswersResult.count, actualAnswersResult.count);
      const totalViews = viewsResult.count || totalAnswers; // Use answer count as views if no focus events
      const totalSkips = skipsResult.count;

      const avgTimeSpent = timeEvents.length > 0
        ? timeEvents.reduce((sum: number, event: any) => sum + (event.duration || 0), 0) / timeEvents.length / 1000
        : 0;

      const sortedTimes = timeEvents.map((e: any) => e.duration || 0).sort((a: number, b: number) => a - b);
      const medianTimeSpent = sortedTimes.length > 0
        ? sortedTimes[Math.floor(sortedTimes.length / 2)] / 1000
        : 0;

      // Get aggregates for this question
      const questionAggregateData = aggregatesData[question.questionId];
      const aggregation = questionAggregateData?.aggregation;

      // Transform aggregates to frontend format
      let aggregates: Array<{ option: string; count: number; percentage: number }> | undefined;
      let textAnswers: string[] | undefined;

      if (aggregation) {
        if (question.questionType === 'yes_no') {
          // Transform yes/no object to array format
          aggregates = [
            { option: 'Yes', count: aggregation.yes || 0, percentage: totalAnswers > 0 ? Math.round((aggregation.yes / totalAnswers) * 100) : 0 },
            { option: 'No', count: aggregation.no || 0, percentage: totalAnswers > 0 ? Math.round((aggregation.no / totalAnswers) * 100) : 0 }
          ];
        } else if (question.questionType === 'multiple_choice' || question.questionType === 'radio' || question.questionType === 'short_text') {
          // Already in array format from repository, just rename 'percent' to 'percentage'
          // short_text now uses grouped aggregates with case-insensitive grouping
          aggregates = aggregation.map((item: any) => ({
            option: item.option,
            count: item.count,
            percentage: item.percent
          }));
        } else if (question.questionType === 'long_text') {
          // For long_text, show raw text responses (usually unique)
          // But also provide aggregates if there's any clustering
          if (Array.isArray(aggregation) && aggregation.length > 0) {
            aggregates = aggregation.map((item: any) => ({
              option: item.option,
              count: item.count,
              percentage: item.percent
            }));
          }

          // Also get raw text for display
          const textAnswersData = await db
            .select({ value: answers.value })
            .from(answers)
            .innerJoin(responses, eq(answers.responseId, responses.id))
            .where(
              and(
                eq(responses.surveyId, surveyId),
                eq(answers.questionId, question.questionId)
              )
            );

          textAnswers = textAnswersData
            .map((a: { value: any }) => {
              const value = a.value;
              if (typeof value === 'string') return value;
              if (typeof value === 'object' && value !== null) {
                return (value as any).text || String(value);
              }
              return String(value);
            })
            .filter((text: string) => text && text.trim().length > 0);
        } else if (question.questionType === 'date_time') {
          // For date_time, show aggregated date/time values
          if (Array.isArray(aggregation) && aggregation.length > 0) {
            aggregates = aggregation.map((item: any) => ({
              option: item.option,
              count: item.count,
              percentage: item.percent
            }));
          }
        }
      }

      analytics.push({
        questionId: question.questionId,
        questionTitle: question.questionTitle,
        questionType: question.questionType,
        pageId: question.pageId,
        totalResponses,
        totalViews,
        totalAnswers,
        totalSkips,
        answerRate: totalViews > 0 ? Math.round((totalAnswers / totalViews) * 100) : 0,
        avgTimeSpent,
        medianTimeSpent,
        dropOffCount: totalViews - totalAnswers - totalSkips,
        aggregates,
        textAnswers,
      });
    }

    return analytics;
  }

  /**
   * Get page-level analytics
   */
  async getPageAnalytics(surveyId: string, userId: string): Promise<PageAnalytics[]> {
    // Verify ownership
    const survey = await this.surveyRepo.findById(surveyId);
    if (!survey) {
      throw new Error("Survey not found");
    }

    if (survey.creatorId !== userId) {
      throw new Error("Access denied - you do not own this survey");
    }

    // Get all pages for this survey
    const pages = await db
      .select({
        pageId: surveyPages.id,
        pageTitle: surveyPages.title,
        pageOrder: surveyPages.order,
      })
      .from(surveyPages)
      .where(eq(surveyPages.surveyId, surveyId))
      .orderBy(surveyPages.order);

    const analytics: PageAnalytics[] = [];

    for (const page of pages) {
      // Count page views
      const [viewsResult] = await db
        .select({ count: count() })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.surveyId, surveyId),
            eq(analyticsEvents.pageId, page.pageId),
            eq(analyticsEvents.event, 'page_view')
          )
        );

      // Count page completions (page_leave events)
      const [completionsResult] = await db
        .select({ count: count() })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.surveyId, surveyId),
            eq(analyticsEvents.pageId, page.pageId),
            eq(analyticsEvents.event, 'page_leave')
          )
        );

      // Calculate average time spent on page
      const pageTimeEvents = await db
        .select({ duration: analyticsEvents.duration })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.surveyId, surveyId),
            eq(analyticsEvents.pageId, page.pageId),
            eq(analyticsEvents.event, 'page_leave'),
            sql`duration IS NOT NULL`
          )
        );

      const totalViews = viewsResult.count;
      const totalCompletions = completionsResult.count;
      const avgTimeSpent = pageTimeEvents.length > 0
        ? pageTimeEvents.reduce((sum: number, event: any) => sum + (event.duration || 0), 0) / pageTimeEvents.length / 1000
        : 0;

      const sortedTimes = pageTimeEvents.map((e: any) => e.duration || 0).sort((a: number, b: number) => a - b);
      const medianTimeSpent = sortedTimes.length > 0
        ? sortedTimes[Math.floor(sortedTimes.length / 2)] / 1000
        : 0;

      // Get question analytics for this page
      const questionAnalytics = await this.getQuestionAnalytics(surveyId, userId);
      const pageQuestions = questionAnalytics.filter(q => q.pageId === page.pageId);

      analytics.push({
        pageId: page.pageId,
        pageTitle: page.pageTitle,
        pageOrder: page.pageOrder,
        totalViews,
        totalCompletions,
        completionRate: totalViews > 0 ? Math.round((totalCompletions / totalViews) * 100) : 0,
        avgTimeSpent,
        medianTimeSpent,
        dropOffCount: totalViews - totalCompletions,
        questions: pageQuestions,
      });
    }

    return analytics;
  }

  /**
   * Get completion funnel data
   */
  async getCompletionFunnel(surveyId: string, userId: string): Promise<CompletionFunnelData[]> {
    // Verify ownership
    const survey = await this.surveyRepo.findById(surveyId);
    if (!survey) {
      throw new Error("Survey not found");
    }

    if (survey.creatorId !== userId) {
      throw new Error("Access denied - you do not own this survey");
    }

    const pageAnalytics = await this.getPageAnalytics(surveyId, userId);

    return pageAnalytics.map(page => ({
      pageId: page.pageId,
      pageTitle: page.pageTitle,
      pageOrder: page.pageOrder,
      entrances: page.totalViews,
      exits: page.dropOffCount,
      completions: page.totalCompletions,
      dropOffRate: page.totalViews > 0 ? Math.round((page.dropOffCount / page.totalViews) * 100) : 0,
    }));
  }

  /**
   * Get time spent data
   */
  async getTimeSpentData(surveyId: string, userId: string): Promise<TimeSpentData[]> {
    // Verify ownership
    const survey = await this.surveyRepo.findById(surveyId);
    if (!survey) {
      throw new Error("Survey not found");
    }

    if (survey.creatorId !== userId) {
      throw new Error("Access denied - you do not own this survey");
    }

    // Get all responses for this survey
    const surveyResponses = await db
      .select({ responseId: responses.id })
      .from(responses)
      .where(eq(responses.surveyId, surveyId));

    const timeSpentData: TimeSpentData[] = [];

    for (const response of surveyResponses) {
      // Get all time-based events for this response
      const events = await db
        .select({
          pageId: analyticsEvents.pageId,
          questionId: analyticsEvents.questionId,
          duration: analyticsEvents.duration,
          event: analyticsEvents.event,
        })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.responseId, response.responseId),
            sql`duration IS NOT NULL`
          )
        );

      const totalTime = events.reduce((sum: number, event: any) => sum + (event.duration || 0), 0);

      const pageTimeSpent = events
        .filter((e: any) => e.pageId && e.event === 'page_leave')
        .map((e: any) => ({ pageId: e.pageId!, duration: e.duration || 0 }));

      const questionTimeSpent = events
        .filter((e: any) => e.questionId && (e.event === 'question_answer' || e.event === 'question_skip'))
        .map((e: any) => ({ questionId: e.questionId!, duration: e.duration || 0 }));

      timeSpentData.push({
        surveyId,
        responseId: response.responseId,
        totalTime,
        pageTimeSpent,
        questionTimeSpent,
      });
    }

    return timeSpentData;
  }

  /**
   * Get engagement metrics
   */
  async getEngagementMetrics(surveyId: string, userId: string): Promise<EngagementMetrics> {
    // Verify ownership
    const survey = await this.surveyRepo.findById(surveyId);
    if (!survey) {
      throw new Error("Survey not found");
    }

    if (survey.creatorId !== userId) {
      throw new Error("Access denied - you do not own this survey");
    }

    const timeSpentData = await this.getTimeSpentData(surveyId, userId);

    // Calculate average session duration
    const avgSessionDuration = timeSpentData.length > 0
      ? timeSpentData.reduce((sum, data) => sum + data.totalTime, 0) / timeSpentData.length / 60000 // Convert to minutes
      : 0;

    // Calculate bounce rate (responses with no answers)
    const [totalResponsesResult] = await db
      .select({ count: count() })
      .from(responses)
      .where(eq(responses.surveyId, surveyId));

    const uniqueAnsweredResponses = await db
      .select({ responseId: analyticsEvents.responseId })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.surveyId, surveyId),
          eq(analyticsEvents.event, 'question_answer')
        )
      )
      .groupBy(analyticsEvents.responseId);

    const bounceRate = totalResponsesResult.count > 0
      ? Math.round(((totalResponsesResult.count - uniqueAnsweredResponses.length) / totalResponsesResult.count) * 100)
      : 0;

    // Calculate engagement score (simplified)
    const engagementScore = Math.max(0, Math.min(100, Math.round(100 - bounceRate + (avgSessionDuration * 10))));

    // Get completion trends by hour
    const completionTrends = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM timestamp)`,
        completions: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.surveyId, surveyId),
          eq(analyticsEvents.event, 'survey_complete')
        )
      )
      .groupBy(sql`EXTRACT(HOUR FROM timestamp)`);

    const peakEngagementHour = completionTrends.length > 0
      ? completionTrends.reduce((max: any, current: any) => current.completions > max.completions ? current : max).hour
      : 12; // Default to noon

    return {
      surveyId,
      avgSessionDuration,
      bounceRate,
      engagementScore,
      peakEngagementHour,
      completionTrends: completionTrends.map((trend: any) => ({ hour: trend.hour, completions: trend.completions })),
    };
  }

  /**
   * Get aggregated question analytics for visualization
   * Returns per-question aggregates ready for charts and summaries
   */
  async getQuestionAggregates(surveyId: string, userId: string) {
    // Verify ownership
    const survey = await this.surveyRepo.findById(surveyId);
    if (!survey) {
      throw new Error("Survey not found");
    }

    if (survey.creatorId !== userId) {
      throw new Error("Access denied - you do not own this survey");
    }

    // Get aggregates from repository
    const aggregates = await this.analyticsRepo.getQuestionAggregates(surveyId);

    // Convert Record to Array for easier frontend consumption
    return Object.values(aggregates);
  }

  /**
   * Get dashboard statistics for a user
   */
  async getDashboardStats(creatorId: string): Promise<DashboardStats> {
    const [totalSurveysResult] = await db
      .select({ count: count() })
      .from(surveys)
      .where(eq(surveys.creatorId, creatorId));

    const [activeSurveysResult] = await db
      .select({ count: count() })
      .from(surveys)
      .where(and(eq(surveys.creatorId, creatorId), eq(surveys.status, 'open')));

    const [draftSurveysResult] = await db
      .select({ count: count() })
      .from(surveys)
      .where(and(eq(surveys.creatorId, creatorId), eq(surveys.status, 'draft')));

    const [closedSurveysResult] = await db
      .select({ count: count() })
      .from(surveys)
      .where(and(eq(surveys.creatorId, creatorId), eq(surveys.status, 'closed')));

    const [totalResponsesResult] = await db
      .select({ count: count() })
      .from(responses)
      .leftJoin(surveys, eq(responses.surveyId, surveys.id))
      .where(eq(surveys.creatorId, creatorId));

    const [completedResponsesResult] = await db
      .select({ count: count() })
      .from(responses)
      .leftJoin(surveys, eq(responses.surveyId, surveys.id))
      .where(and(eq(surveys.creatorId, creatorId), eq(responses.completed, true)));

    const totalSurveys = totalSurveysResult.count;
    const totalResponses = totalResponsesResult.count;
    const completedResponses = completedResponsesResult.count;
    const completionRate = totalResponses > 0 ? Math.round((completedResponses / totalResponses) * 100) : 0;
    const avgResponsesPerSurvey = totalSurveys > 0 ? Math.round((totalResponses / totalSurveys) * 10) / 10 : 0;

    // Get recent activity
    const recentActivity = await this.getRecentActivity(creatorId, 5);

    return {
      totalSurveys,
      activeSurveys: activeSurveysResult.count,
      draftSurveys: draftSurveysResult.count,
      closedSurveys: closedSurveysResult.count,
      totalResponses,
      completionRate,
      avgResponsesPerSurvey,
      recentActivity,
    };
  }

  /**
   * Get analytics for all surveys by a creator
   */
  async getSurveyAnalytics(creatorId: string): Promise<SurveyAnalytics[]> {
    const surveysData = await db
      .select({
        surveyId: surveys.id,
        title: surveys.title,
        status: surveys.status,
      })
      .from(surveys)
      .where(eq(surveys.creatorId, creatorId))
      .orderBy(desc(surveys.updatedAt));

    const analytics: SurveyAnalytics[] = [];

    for (const survey of surveysData) {
      const [responseCountResult] = await db
        .select({ count: count() })
        .from(responses)
        .where(eq(responses.surveyId, survey.surveyId));

      const [completedCountResult] = await db
        .select({ count: count() })
        .from(responses)
        .where(and(eq(responses.surveyId, survey.surveyId), eq(responses.completed, true)));

      const [lastResponseResult] = await db
        .select({ submittedAt: responses.submittedAt })
        .from(responses)
        .where(eq(responses.surveyId, survey.surveyId))
        .orderBy(desc(responses.submittedAt))
        .limit(1);

      const responseCount = responseCountResult.count;
      const completedCount = completedCountResult.count;
      const completionRate = responseCount > 0 ? Math.round((completedCount / responseCount) * 100) : 0;

      // Calculate actual completion time data
      const timeSpentData = await this.getTimeSpentDataInternal(survey.surveyId);
      const completedTimeData = timeSpentData.filter(data => {
        // Check if response was completed by looking for survey_complete events
        return data.totalTime > 0;
      });

      const avgCompletionTime = completedTimeData.length > 0
        ? completedTimeData.reduce((sum, data) => sum + data.totalTime, 0) / completedTimeData.length / 60000 // Convert to minutes
        : 0;

      const sortedCompletionTimes = completedTimeData.map(data => data.totalTime).sort((a, b) => a - b);
      const medianCompletionTime = sortedCompletionTimes.length > 0
        ? sortedCompletionTimes[Math.floor(sortedCompletionTimes.length / 2)] / 60000
        : 0;

      const totalTimeSpent = completedTimeData.reduce((sum, data) => sum + data.totalTime, 0) / 60000;

      // Calculate drop-off rate
      const [totalStartedResult] = await db
        .select({ count: count() })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.surveyId, survey.surveyId),
            eq(analyticsEvents.event, 'survey_start')
          )
        );

      const dropOffRate = totalStartedResult.count > 0
        ? Math.round(((totalStartedResult.count - completedCount) / totalStartedResult.count) * 100)
        : 0;

      // Find most and least answered questions
      const questionAnalytics = await this.getQuestionAnalyticsInternal(survey.surveyId);
      const mostAnswered = questionAnalytics.reduce((max, q) => q.totalAnswers > max.totalAnswers ? q : max, questionAnalytics[0] || { totalAnswers: 0, questionId: undefined });
      const leastAnswered = questionAnalytics.reduce((min, q) => q.totalAnswers < min.totalAnswers ? q : min, questionAnalytics[0] || { totalAnswers: Infinity, questionId: undefined });

      analytics.push({
        surveyId: survey.surveyId,
        title: survey.title,
        responseCount,
        completionRate,
        avgCompletionTime,
        medianCompletionTime,
        totalTimeSpent,
        dropOffRate,
        mostAnsweredQuestionId: mostAnswered?.questionId,
        leastAnsweredQuestionId: leastAnswered?.questionId,
        lastResponseAt: lastResponseResult?.submittedAt || null,
        status: survey.status,
      });
    }

    return analytics;
  }

  /**
   * Get response trends over time for a creator
   */
  async getResponseTrends(creatorId: string, days: number = 30): Promise<ResponseTrend[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const trendsData = await db
      .select({
        date: sql<string>`DATE(${responses.createdAt})`,
        total: count(),
        completed: sql<number>`SUM(CASE WHEN ${responses.completed} THEN 1 ELSE 0 END)`,
      })
      .from(responses)
      .leftJoin(surveys, eq(responses.surveyId, surveys.id))
      .where(and(
        eq(surveys.creatorId, creatorId),
        gte(responses.createdAt, startDate)
      ))
      .groupBy(sql`DATE(${responses.createdAt})`)
      .orderBy(sql`DATE(${responses.createdAt})`);

    // Get time data for each day
    const trendsWithTime: ResponseTrend[] = [];

    for (const row of trendsData) {
      // Get time data for responses created on this date
      const dayTimeData = await db
        .select({
          duration: analyticsEvents.duration,
          responseId: analyticsEvents.responseId,
        })
        .from(analyticsEvents)
        .innerJoin(responses, eq(analyticsEvents.responseId, responses.id))
        .innerJoin(surveys, eq(responses.surveyId, surveys.id))
        .where(
          and(
            eq(surveys.creatorId, creatorId),
            sql`DATE(${responses.createdAt}) = ${row.date}`,
            sql`duration IS NOT NULL`,
            eq(analyticsEvents.event, 'survey_complete')
          )
        );

      const avgCompletionTime = dayTimeData.length > 0
        ? dayTimeData.reduce((sum: number, event: any) => sum + (event.duration || 0), 0) / dayTimeData.length / 60000
        : 0;

      const totalTimeSpent = dayTimeData.reduce((sum: number, event: any) => sum + (event.duration || 0), 0) / 60000;

      trendsWithTime.push({
        date: row.date,
        count: row.total,
        completed: Number(row.completed),
        avgCompletionTime,
        totalTimeSpent,
      });
    }

    return trendsWithTime;
  }

  /**
   * Get recent activity for a creator
   */
  async getRecentActivity(creatorId: string, limit: number = 10): Promise<ActivityItem[]> {
    const activities: ActivityItem[] = [];

    // Recent survey creations/updates
    const recentSurveys = await db
      .select({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
        createdAt: surveys.createdAt,
        updatedAt: surveys.updatedAt,
      })
      .from(surveys)
      .where(eq(surveys.creatorId, creatorId))
      .orderBy(desc(surveys.updatedAt))
      .limit(limit);

    for (const survey of recentSurveys) {
      const createdTime = survey.createdAt?.getTime() || 0;
      const updatedTime = survey.updatedAt?.getTime() || 0;

      activities.push({
        id: randomUUID(),
        type: createdTime === updatedTime ? 'survey_created' : 'survey_published',
        title: survey.title,
        description: createdTime === updatedTime
          ? 'Survey was created'
          : `Survey status changed to ${survey.status}`,
        timestamp: survey.updatedAt || survey.createdAt || new Date(),
        surveyId: survey.id,
      });
    }

    // Recent responses
    const recentResponses = await db
      .select({
        responseId: responses.id,
        surveyId: responses.surveyId,
        surveyTitle: surveys.title,
        submittedAt: responses.submittedAt,
        completed: responses.completed,
      })
      .from(responses)
      .leftJoin(surveys, eq(responses.surveyId, surveys.id))
      .where(eq(surveys.creatorId, creatorId))
      .orderBy(desc(responses.createdAt))
      .limit(limit);

    for (const response of recentResponses) {
      if (response.submittedAt) {
        activities.push({
          id: randomUUID(),
          type: 'response_received',
          title: response.surveyTitle || 'Unknown Survey',
          description: response.completed ? 'Response completed' : 'Response received',
          timestamp: response.submittedAt,
          surveyId: response.surveyId,
          responseId: response.responseId,
        });
      }
    }

    // Sort all activities by timestamp and return limited results
    return activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Internal method to get question analytics without ownership check
   * Used by getSurveyAnalytics to avoid redundant checks
   */
  private async getQuestionAnalyticsInternal(surveyId: string): Promise<QuestionAnalytics[]> {
    // This is a simplified version without ownership check
    // since it's called internally by getSurveyAnalytics which already checks ownership

    // Count total responses for this survey
    const [totalResponsesResult] = await db
      .select({ count: count() })
      .from(responses)
      .where(eq(responses.surveyId, surveyId));

    const totalResponses = totalResponsesResult.count;

    // Get all questions for this survey
    const surveyQuestions = await db
      .select({
        questionId: questions.id,
        questionTitle: questions.title,
        questionType: questions.type,
        pageId: questions.pageId,
      })
      .from(questions)
      .innerJoin(surveyPages, eq(questions.pageId, surveyPages.id))
      .where(eq(surveyPages.surveyId, surveyId));

    const analytics: QuestionAnalytics[] = [];

    for (const question of surveyQuestions) {
      // Count actual answers from answers table
      const [actualAnswersResult] = await db
        .select({ count: count() })
        .from(answers)
        .innerJoin(responses, eq(answers.responseId, responses.id))
        .where(
          and(
            eq(responses.surveyId, surveyId),
            eq(answers.questionId, question.questionId)
          )
        );

      analytics.push({
        questionId: question.questionId,
        questionTitle: question.questionTitle,
        questionType: question.questionType,
        pageId: question.pageId,
        totalResponses,
        totalViews: actualAnswersResult.count,
        totalAnswers: actualAnswersResult.count,
        totalSkips: 0,
        answerRate: 0,
        avgTimeSpent: 0,
        medianTimeSpent: 0,
        dropOffCount: 0,
      });
    }

    return analytics;
  }

  /**
   * Internal method to get time spent data without ownership check
   * Used by getSurveyAnalytics to avoid redundant checks
   */
  private async getTimeSpentDataInternal(surveyId: string): Promise<TimeSpentData[]> {
    // Get all responses for this survey
    const surveyResponses = await db
      .select({ responseId: responses.id })
      .from(responses)
      .where(eq(responses.surveyId, surveyId));

    const timeSpentData: TimeSpentData[] = [];

    for (const response of surveyResponses) {
      // Get all time-based events for this response
      const events = await db
        .select({
          pageId: analyticsEvents.pageId,
          questionId: analyticsEvents.questionId,
          duration: analyticsEvents.duration,
          event: analyticsEvents.event,
        })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.responseId, response.responseId),
            sql`duration IS NOT NULL`
          )
        );

      const totalTime = events.reduce((sum: number, event: any) => sum + (event.duration || 0), 0);

      const pageTimeSpent = events
        .filter((e: any) => e.pageId && e.event === 'page_leave')
        .map((e: any) => ({ pageId: e.pageId!, duration: e.duration || 0 }));

      const questionTimeSpent = events
        .filter((e: any) => e.questionId && (e.event === 'question_answer' || e.event === 'question_skip'))
        .map((e: any) => ({ questionId: e.questionId!, duration: e.duration || 0 }));

      timeSpentData.push({
        surveyId,
        responseId: response.responseId,
        totalTime,
        pageTimeSpent,
        questionTimeSpent,
      });
    }

    return timeSpentData;
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
