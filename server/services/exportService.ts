import { createObjectCsvWriter } from 'csv-writer';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { surveyRepository, pageRepository, questionRepository, responseRepository } from '../repositories';
import { analyticsService } from './AnalyticsService';
import type { Survey, Response, Answer, Question, LoopGroupSubquestion, QuestionWithSubquestions } from '@shared/schema';
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { formatAnswerValue as formatAnswerValueUtil, extractTextValue } from '../utils/answerFormatting';
import { logger } from '../logger';

export interface ExportOptions {
  format: 'csv' | 'pdf';
  includeIncomplete?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  questionIds?: string[];
}

export interface ExportedFile {
  filename: string;
  path: string;
  size: number;
  mimeType: string;
}

class ExportService {
  private exportDir = path.join(process.cwd(), 'exports');

  constructor() {
    // Ensure export directory exists
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  async exportSurveyData(surveyId: string, userId: string, options: ExportOptions): Promise<ExportedFile> {
    const survey = await surveyRepository.findById(surveyId);
    if (!survey) {
      throw new Error('Survey not found');
    }

    // Verify ownership
    if (survey.creatorId !== userId) {
      throw new Error('Access denied - you do not own this survey');
    }

    const responses = await this.getFilteredResponses(surveyId, options);
    const questions = await this.getAllQuestionsForSurvey(surveyId);

    // Get analytics data
    const analytics = await this.getAnalyticsData(surveyId, userId);

    if (options.format === 'csv') {
      return await this.generateCSV(survey, responses, questions, analytics, options);
    } else {
      return await this.generatePDF(survey, responses, questions, analytics, options);
    }
  }

  private async getAnalyticsData(surveyId: string, userId: string) {
    try {
      const [questionAnalytics, pageAnalytics, timeSpent, engagement] = await Promise.all([
        analyticsService.getQuestionAnalytics(surveyId, userId),
        analyticsService.getPageAnalytics(surveyId, userId),
        analyticsService.getTimeSpentData(surveyId, userId),
        analyticsService.getEngagementMetrics(surveyId, userId)
      ]);

      return {
        questionAnalytics,
        pageAnalytics,
        timeSpent,
        engagement
      };
    } catch (error) {
      logger.error({ error }, 'Error fetching analytics');
      // Return empty analytics if there's an error
      return {
        questionAnalytics: {},
        pageAnalytics: {},
        timeSpent: {},
        engagement: {}
      };
    }
  }

  private async getFilteredResponses(surveyId: string, options: ExportOptions): Promise<Response[]> {
    let responses = await responseRepository.findBySurvey(surveyId);

    // Filter by completion status
    if (!options.includeIncomplete) {
      responses = responses.filter(r => r.completed);
    }

    // Filter by date range
    if (options.dateFrom) {
      responses = responses.filter(r => r.submittedAt && r.submittedAt >= options.dateFrom!);
    }

    if (options.dateTo) {
      responses = responses.filter(r => r.submittedAt && r.submittedAt <= options.dateTo!);
    }

    return responses;
  }

  private async getAllQuestionsForSurvey(surveyId: string): Promise<QuestionWithSubquestions[]> {
    const pages = await pageRepository.findBySurvey(surveyId);
    const allQuestions: QuestionWithSubquestions[] = [];

    for (const page of pages) {
      const questions = await questionRepository.findByPageWithSubquestions(page.id);
      allQuestions.push(...questions);
    }

    return allQuestions;
  }

  private async generateCSV(
    survey: Survey,
    responses: Response[],
    questions: QuestionWithSubquestions[],
    analytics: any,
    options: ExportOptions
  ): Promise<ExportedFile> {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const filename = `${survey.title.replace(/[^a-zA-Z0-9]/g, '_')}_export_${timestamp}.csv`;
    const filePath = path.join(this.exportDir, filename);

    // Build CSV headers
    const headers = this.buildCSVHeaders(questions, options);

    // Build CSV records
    const records = await this.buildCSVRecords(responses, questions, options);

    // Create CSV writer for main data
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: headers
    });

    await csvWriter.writeRecords(records);

    // Append analytics summary to CSV
    await this.appendAnalyticsToCSV(filePath, questions, analytics);

    const stats = fs.statSync(filePath);
    return {
      filename,
      path: filePath,
      size: stats.size,
      mimeType: 'text/csv'
    };
  }

  private async appendAnalyticsToCSV(filePath: string, questions: QuestionWithSubquestions[], analytics: any) {
    let analyticsContent = '\n\n# ANALYTICS SUMMARY\n\n';

    // Add question analytics
    analyticsContent += '## Question Analytics\n';
    analyticsContent += 'Question ID,Question Title,Total Views,Total Answers,Answer Rate,Avg Time (seconds)\n';

    for (const question of questions) {
      const qAnalytics = analytics.questionAnalytics[question.id];
      if (qAnalytics) {
        const answerRate = qAnalytics.totalViews > 0
          ? ((qAnalytics.totalAnswers / qAnalytics.totalViews) * 100).toFixed(1)
          : '0';
        analyticsContent += `${question.id},"${question.title}",${qAnalytics.totalViews},${qAnalytics.totalAnswers},${answerRate}%,${qAnalytics.averageTimeSpent || 0}\n`;
      }
    }

    // Add time spent data
    if (analytics.timeSpent && Object.keys(analytics.timeSpent).length > 0) {
      analyticsContent += '\n## Time Spent Analytics\n';
      analyticsContent += `Average Survey Time,${analytics.timeSpent.averageTimeSeconds || 0} seconds\n`;
      analyticsContent += `Median Survey Time,${analytics.timeSpent.medianTimeSeconds || 0} seconds\n`;
    }

    // Add engagement metrics
    if (analytics.engagement && Object.keys(analytics.engagement).length > 0) {
      analyticsContent += '\n## Engagement Metrics\n';
      analyticsContent += `Total Starts,${analytics.engagement.totalStarts || 0}\n`;
      analyticsContent += `Total Completions,${analytics.engagement.totalCompletions || 0}\n`;
      analyticsContent += `Completion Rate,${analytics.engagement.completionRate || 0}%\n`;
      analyticsContent += `Abandon Rate,${analytics.engagement.abandonRate || 0}%\n`;
    }

    // Append to file
    fs.appendFileSync(filePath, analyticsContent);
  }

  private buildCSVHeaders(questions: QuestionWithSubquestions[], options: ExportOptions) {
    const headers: { id: string; title: string }[] = [];

    // Add metadata headers
    headers.push({ id: 'response_id', title: 'Response ID' });
    headers.push({ id: 'recipient_name', title: 'Recipient Name' });
    headers.push({ id: 'recipient_email', title: 'Recipient Email' });
    headers.push({ id: 'completed', title: 'Completed' });
    headers.push({ id: 'submitted_at', title: 'Submitted At' });
    headers.push({ id: 'created_at', title: 'Started At' });

    // Filter questions if specified
    const filteredQuestions = options.questionIds 
      ? questions.filter(q => options.questionIds!.includes(q.id))
      : questions;

    // Add question headers
    for (const question of filteredQuestions) {
      if (question.type === 'loop_group' && question.subquestions) {
        // For loop groups, create separate columns for each iteration
        for (let i = 0; i < 10; i++) { // Support up to 10 iterations
          for (const subquestion of question.subquestions) {
            headers.push({
              id: `${question.id}_${subquestion.id}_${i}`,
              title: `${question.title} - ${subquestion.title} (Instance ${i + 1})`
            });
          }
        }
      } else {
        headers.push({
          id: question.id,
          title: question.title
        });

        // Add additional columns for file uploads
        if (question.type === 'file_upload') {
          headers.push({
            id: `${question.id}_files`,
            title: `${question.title} - File Names`
          });
        }
      }
    }

    return headers;
  }

  private async buildCSVRecords(
    responses: Response[],
    questions: QuestionWithSubquestions[],
    options: ExportOptions
  ) {
    const records = [];

    for (const response of responses) {
      const answers = await responseRepository.findAnswersWithQuestionsByResponse(response.id);

      const record: Record<string, any> = {
        response_id: response.id,
        completed: response.completed ? 'Yes' : 'No',
        submitted_at: response.submittedAt ? format(new Date(response.submittedAt), 'yyyy-MM-dd HH:mm:ss') : '',
        created_at: response.createdAt ? format(new Date(response.createdAt), 'yyyy-MM-dd HH:mm:ss') : ''
      };

      // Filter questions if specified
      const filteredQuestions = options.questionIds 
        ? questions.filter(q => options.questionIds!.includes(q.id))
        : questions;

      // Add answer data
      for (const question of filteredQuestions) {
        const questionAnswers = answers.filter(a => a.questionId === question.id);

        if (question.type === 'loop_group' && question.subquestions) {
          // Handle loop group answers
          for (let i = 0; i < 10; i++) {
            for (const subquestion of question.subquestions) {
              const loopAnswer = questionAnswers.find(a => 
                a.subquestionId === subquestion.id && a.loopIndex === i
              );
              record[`${question.id}_${subquestion.id}_${i}`] = loopAnswer 
                ? this.formatAnswerValue(loopAnswer.value, subquestion.type)
                : '';
            }
          }
        } else {
          const answer = questionAnswers[0];
          if (answer) {
            record[question.id] = this.formatAnswerValue(answer.value, question.type);
            
            // Handle file uploads
            if (question.type === 'file_upload' && answer.value && typeof answer.value === 'object' && 'files' in answer.value) {
              const fileNames = (answer.value as any).files?.map((f: any) => f.originalName).join('; ') || '';
              record[`${question.id}_files`] = fileNames;
            }
          } else {
            record[question.id] = '';
            if (question.type === 'file_upload') {
              record[`${question.id}_files`] = '';
            }
          }
        }
      }

      records.push(record);
    }

    return records;
  }

  private formatAnswerValue(value: any, questionType: string): string {
    // Use the utility function which properly handles { text: "value" } objects
    return formatAnswerValueUtil(value, questionType);
  }

  private async generatePDF(
    survey: Survey,
    responses: Response[],
    questions: QuestionWithSubquestions[],
    analytics: any,
    options: ExportOptions
  ): Promise<ExportedFile> {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const filename = `${survey.title.replace(/[^a-zA-Z0-9]/g, '_')}_report_${timestamp}.pdf`;
    const filePath = path.join(this.exportDir, filename);

    const doc = new jsPDF();

    // Add title page
    this.addTitlePage(doc, survey, responses);

    // Add summary statistics
    this.addSummaryPage(doc, survey, responses, questions);

    // Add analytics overview
    this.addAnalyticsOverview(doc, analytics);

    // Add detailed responses
    await this.addResponsesSection(doc, responses, questions);

    // Add question analysis with analytics
    await this.addQuestionAnalysisWithAnalytics(doc, survey, responses, questions, analytics);

    doc.save(filePath);

    const stats = fs.statSync(filePath);
    return {
      filename,
      path: filePath,
      size: stats.size,
      mimeType: 'application/pdf'
    };
  }

  private addAnalyticsOverview(doc: jsPDF, analytics: any) {
    doc.setFontSize(18);
    doc.text('Analytics Overview', 20, 30);

    const analyticsData = [];

    // Time spent data
    if (analytics.timeSpent && Object.keys(analytics.timeSpent).length > 0) {
      analyticsData.push(['Avg Survey Time', `${analytics.timeSpent.averageTimeSeconds || 0} seconds`]);
      analyticsData.push(['Median Survey Time', `${analytics.timeSpent.medianTimeSeconds || 0} seconds`]);
    }

    // Engagement metrics
    if (analytics.engagement && Object.keys(analytics.engagement).length > 0) {
      analyticsData.push(['Total Starts', (analytics.engagement.totalStarts || 0).toString()]);
      analyticsData.push(['Total Completions', (analytics.engagement.totalCompletions || 0).toString()]);
      analyticsData.push(['Completion Rate', `${analytics.engagement.completionRate || 0}%`]);
      analyticsData.push(['Abandon Rate', `${analytics.engagement.abandonRate || 0}%`]);
    }

    if (analyticsData.length > 0) {
      autoTable(doc, {
        head: [['Metric', 'Value']],
        body: analyticsData,
        startY: 50,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [66, 139, 202] }
      });
    } else {
      doc.setFontSize(12);
      doc.text('No analytics data available.', 20, 50);
    }

    doc.addPage();
  }

  private async addQuestionAnalysisWithAnalytics(
    doc: jsPDF,
    survey: Survey,
    responses: Response[],
    questions: QuestionWithSubquestions[],
    analytics: any
  ) {
    doc.setFontSize(18);
    doc.text('Question Analysis with Analytics', 20, 30);

    let yPosition = 50;

    for (const question of questions.slice(0, 10)) {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 30;
      }

      const answers = [];
      for (const response of responses) {
        const responseAnswers = await responseRepository.findAnswersByResponse(response.id);
        const questionAnswer = responseAnswers.find(a => a.questionId === question.id);
        if (questionAnswer) {
          answers.push(questionAnswer);
        }
      }

      // Question header
      doc.setFontSize(14);
      doc.text(question.title, 20, yPosition);
      yPosition += 15;

      // Question stats with analytics
      doc.setFontSize(10);
      doc.text(`Type: ${question.type}`, 20, yPosition);
      doc.text(`Responses: ${answers.length}/${responses.length}`, 120, yPosition);
      yPosition += 10;

      // Add analytics data if available
      const qAnalytics = analytics.questionAnalytics[question.id];
      if (qAnalytics) {
        doc.text(`Views: ${qAnalytics.totalViews}`, 20, yPosition);
        doc.text(`Answers: ${qAnalytics.totalAnswers}`, 80, yPosition);
        const answerRate = qAnalytics.totalViews > 0
          ? ((qAnalytics.totalAnswers / qAnalytics.totalViews) * 100).toFixed(1)
          : '0';
        doc.text(`Answer Rate: ${answerRate}%`, 140, yPosition);
        yPosition += 15;
      } else {
        yPosition += 5;
      }

      // Answer analysis based on question type
      if (question.type === 'multiple_choice' || question.type === 'radio') {
        const optionCounts = this.analyzeChoiceQuestion(answers, question.options as string[]);
        const analysisData = Object.entries(optionCounts).map(([option, count]) => [option, count.toString()]);

        if (analysisData.length > 0) {
          autoTable(doc, {
            head: [['Option', 'Count']],
            body: analysisData,
            startY: yPosition,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [66, 139, 202] },
            margin: { left: 20, right: 20 }
          });
          yPosition = (doc as any).lastAutoTable?.finalY + 15 || yPosition + 50;
        }
      } else if (question.type === 'yes_no') {
        const yesCount = answers.filter(a => a.value === true).length;
        const noCount = answers.filter(a => a.value === false).length;

        doc.text(`Yes: ${yesCount} (${answers.length > 0 ? ((yesCount / answers.length) * 100).toFixed(1) : 0}%)`, 30, yPosition);
        doc.text(`No: ${noCount} (${answers.length > 0 ? ((noCount / answers.length) * 100).toFixed(1) : 0}%)`, 30, yPosition + 10);
        yPosition += 25;
      }

      yPosition += 10;
    }

    if (questions.length > 10) {
      doc.text(`... and ${questions.length - 10} more questions`, 20, yPosition);
    }
  }

  private addTitlePage(doc: jsPDF, survey: Survey, responses: Response[]) {
    // Title
    doc.setFontSize(24);
    doc.text(survey.title, 20, 30);

    // Subtitle
    doc.setFontSize(16);
    doc.text('Survey Report', 20, 45);

    // Survey info
    doc.setFontSize(12);
    doc.text(`Generated on: ${format(new Date(), 'MMMM d, yyyy')}`, 20, 60);
    doc.text(`Total Responses: ${responses.length}`, 20, 75);
    doc.text(`Completed Responses: ${responses.filter(r => r.completed).length}`, 20, 90);

    if (survey.description) {
      doc.text('Description:', 20, 110);
      const splitDescription = doc.splitTextToSize(survey.description, 170);
      doc.text(splitDescription, 20, 125);
    }

    doc.addPage();
  }

  private addSummaryPage(doc: jsPDF, survey: Survey, responses: Response[], questions: QuestionWithSubquestions[]) {
    doc.setFontSize(18);
    doc.text('Summary Statistics', 20, 30);

    const completedResponses = responses.filter(r => r.completed).length;
    const completionRate = responses.length > 0 ? (completedResponses / responses.length * 100) : 0;

    // Summary table
    const summaryData = [
      ['Total Responses', responses.length.toString()],
      ['Completed Responses', completedResponses.toString()],
      ['Completion Rate', `${completionRate.toFixed(1)}%`],
      ['Total Questions', questions.length.toString()],
      ['Survey Status', survey.status],
      ['Created', format(new Date(survey.createdAt!), 'MMM d, yyyy')],
      ['Last Updated', format(new Date(survey.updatedAt!), 'MMM d, yyyy')]
    ];

    autoTable(doc, {
      head: [['Metric', 'Value']],
      body: summaryData,
      startY: 50,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [66, 139, 202] }
    });

    doc.addPage();
  }

  private async addResponsesSection(doc: jsPDF, responses: Response[], questions: QuestionWithSubquestions[]) {
    doc.setFontSize(18);
    doc.text('Response Overview', 20, 30);

    if (responses.length === 0) {
      doc.text('No responses found.', 20, 50);
      return;
    }

    // Response summary table
    const responseData = [];
    for (const response of responses.slice(0, 20)) { // Limit to first 20 for PDF
      responseData.push([
        response.id.slice(-8),
        response.completed ? 'Yes' : 'No',
        response.submittedAt ? format(new Date(response.submittedAt), 'MMM d, yyyy') : 'Not submitted'
      ]);
    }

    autoTable(doc, {
      head: [['Response ID', 'Completed', 'Submitted']],
      body: responseData,
      startY: 50,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [66, 139, 202] }
    });

    if (responses.length > 20) {
      const lastY = (doc as any).lastAutoTable?.finalY || 100;
      doc.text(`... and ${responses.length - 20} more responses`, 20, lastY + 20);
    }

    doc.addPage();
  }


  private analyzeChoiceQuestion(answers: Answer[], options: string[]): Record<string, number> {
    const counts: Record<string, number> = {};

    // Initialize all options with 0
    if (options) {
      options.forEach(option => {
        counts[option] = 0;
      });
    }

    // Count answers
    answers.forEach(answer => {
      if (Array.isArray(answer.value)) {
        // Multiple choice
        answer.value.forEach(val => {
          const extractedVal = extractTextValue(val);
          if (extractedVal) {
            counts[extractedVal] = (counts[extractedVal] || 0) + 1;
          }
        });
      } else {
        // Single choice
        const extractedVal = extractTextValue(answer.value);
        if (extractedVal) {
          counts[extractedVal] = (counts[extractedVal] || 0) + 1;
        }
      }
    });

    return counts;
  }

  async cleanupOldExports(maxAgeHours: number = 24): Promise<void> {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    
    try {
      const files = fs.readdirSync(this.exportDir);
      
      for (const file of files) {
        const filePath = path.join(this.exportDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffTime) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error cleaning up exports');
    }
  }

  getExportPath(filename: string): string {
    return path.join(this.exportDir, filename);
  }
}

export const exportService = new ExportService();