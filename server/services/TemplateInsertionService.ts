/**
 * DEPRECATED: Legacy Survey Template Insertion Service
 *
 * This service was used to insert survey templates into existing surveys.
 * It has been disabled as part of the survey system removal (November 2025).
 *
 * ezBuildr is now a workflow-first platform. For template functionality, see:
 * - Document templates (DocumentTemplateRepository)
 * - Workflow templates (WorkflowTemplateRepository)
 * - Template binding system in workflow builder
 *
 * Status: Disabled - no longer used
 */

/**
 * Stub class to maintain compatibility with any existing imports
 * All methods throw errors indicating the service is deprecated
 */
export class TemplateInsertionService {
  /**
   * @deprecated Survey system removed - use workflow templates instead
   */
  insertTemplateIntoSurvey(
    _templateId: string,
    _surveyId: string,
    _creatorId: string
  ): Promise<{
    pagesAdded: number;
    questionsAdded: number;
    templateName: string;
  }> {
    throw new Error(
      "TemplateInsertionService is deprecated. Survey system removed in Nov 2025. " +
      "Use workflow templates and document generation instead."
    );
  }
}

/**
 * Singleton instance (deprecated)
 * @deprecated Use workflow template services instead
 */
export const templateInsertionService = new TemplateInsertionService();
