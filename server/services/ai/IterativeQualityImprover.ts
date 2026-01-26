/**
 * Iterative Quality Improver
 *
 * Automatically refines AI-generated workflows by iteratively sending them back
 * to the AI for improvement until quality is acceptable or further refinement
 * isn't cost-effective.
 *
 * Cost vs Quality Balancing:
 * - Each iteration has a cost (API calls, tokens, time)
 * - Improvement follows diminishing returns curve
 * - Stop when: quality is good enough OR marginal improvement < threshold
 */

import { createLogger } from '../../logger';
import { AIGeneratedWorkflow, AIWorkflowGenerationRequest } from '../../../shared/types/ai';
import { QualityScore, WorkflowQualityValidator, workflowQualityValidator } from '../WorkflowQualityValidator';
import { AIProviderClient } from './AIProviderClient';
import { AIPromptBuilder } from './AIPromptBuilder';

const logger = createLogger({ module: 'iterative-quality-improver' });

export interface QualityImprovementConfig {
  /** Minimum acceptable quality score (0-100). Default: 80 */
  targetQualityScore: number;

  /** Maximum iterations to attempt. Default: 3 */
  maxIterations: number;

  /** Minimum improvement per iteration to continue (0-100). Default: 5 */
  minImprovementThreshold: number;

  /** Stop if we reach this score even if max iterations not reached. Default: 95 */
  excellentQualityThreshold: number;

  /** Estimated cost per iteration in cents. Used for logging/metrics. Default: 5 */
  estimatedCostPerIterationCents: number;

  /** Maximum total cost in cents before stopping. Default: 25 (5 iterations worth) */
  maxTotalCostCents: number;

  /** Categories to prioritize for improvement */
  priorityCategories?: Array<'aliases' | 'types' | 'structure' | 'ux' | 'completeness' | 'validation'>;
}

export interface ImprovementIteration {
  iteration: number;
  qualityScore: QualityScore;
  workflow: AIGeneratedWorkflow;
  durationMs: number;
  improvementFromPrevious: number;
  estimatedCostCents: number;
}

export interface ImprovementResult {
  finalWorkflow: AIGeneratedWorkflow;
  finalQualityScore: QualityScore;
  iterations: ImprovementIteration[];
  totalIterations: number;
  totalDurationMs: number;
  totalEstimatedCostCents: number;
  stoppedReason: 'target_reached' | 'excellent_quality' | 'max_iterations' | 'diminishing_returns' | 'max_cost' | 'no_improvement';
  qualityImprovement: number; // Total improvement from first to last
}

const DEFAULT_CONFIG: QualityImprovementConfig = {
  targetQualityScore: 80,
  maxIterations: 3,
  minImprovementThreshold: 5,
  excellentQualityThreshold: 95,
  estimatedCostPerIterationCents: 5,
  maxTotalCostCents: 25,
};

export class IterativeQualityImprover {
  private client: AIProviderClient;
  private promptBuilder: AIPromptBuilder;
  private validator: WorkflowQualityValidator;
  private config: QualityImprovementConfig;

  constructor(
    client: AIProviderClient,
    promptBuilder: AIPromptBuilder,
    config: Partial<QualityImprovementConfig> = {}
  ) {
    this.client = client;
    this.promptBuilder = promptBuilder;
    this.validator = workflowQualityValidator;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a workflow and iteratively improve it until quality target is met
   */
  async generateWithQualityLoop(
    initialWorkflow: AIGeneratedWorkflow,
    originalRequest: AIWorkflowGenerationRequest,
    initialQualityScore?: QualityScore
  ): Promise<ImprovementResult> {
    const startTime = Date.now();
    const iterations: ImprovementIteration[] = [];

    let currentWorkflow = initialWorkflow;
    let currentScore = initialQualityScore || this.validator.validate(currentWorkflow);
    let totalCost = 0;

    // Record initial state as iteration 0
    iterations.push({
      iteration: 0,
      qualityScore: currentScore,
      workflow: currentWorkflow,
      durationMs: 0,
      improvementFromPrevious: 0,
      estimatedCostCents: 0,
    });

    logger.info({
      initialScore: currentScore.overall,
      targetScore: this.config.targetQualityScore,
      maxIterations: this.config.maxIterations,
      issues: currentScore.issues.length,
    }, 'Starting iterative quality improvement');

    // Check if already at target
    if (currentScore.overall >= this.config.targetQualityScore) {
      return this.buildResult(iterations, 'target_reached', startTime, totalCost);
    }

    if (currentScore.overall >= this.config.excellentQualityThreshold) {
      return this.buildResult(iterations, 'excellent_quality', startTime, totalCost);
    }

    // Iterative improvement loop
    for (let i = 1; i <= this.config.maxIterations; i++) {
      const iterationStart = Date.now();

      // Check cost budget
      if (totalCost + this.config.estimatedCostPerIterationCents > this.config.maxTotalCostCents) {
        logger.info({ totalCost, maxCost: this.config.maxTotalCostCents }, 'Stopping: max cost reached');
        return this.buildResult(iterations, 'max_cost', startTime, totalCost);
      }

      try {
        // Generate improvement prompt based on current issues
        const improvementPrompt = this.buildImprovementPrompt(currentWorkflow, currentScore, originalRequest);

        // Call AI for improvement
        const response = await this.client.callLLM(improvementPrompt, 'workflow_revision');
        const improvedWorkflow = this.parseImprovedWorkflow(response, currentWorkflow);

        // Validate improved workflow
        const newScore = this.validator.validate(improvedWorkflow);
        const improvement = newScore.overall - currentScore.overall;

        totalCost += this.config.estimatedCostPerIterationCents;

        iterations.push({
          iteration: i,
          qualityScore: newScore,
          workflow: improvedWorkflow,
          durationMs: Date.now() - iterationStart,
          improvementFromPrevious: improvement,
          estimatedCostCents: this.config.estimatedCostPerIterationCents,
        });

        logger.info({
          iteration: i,
          previousScore: currentScore.overall,
          newScore: newScore.overall,
          improvement,
          issues: newScore.issues.length,
          duration: Date.now() - iterationStart,
        }, 'Quality improvement iteration completed');

        // Check stopping conditions
        if (newScore.overall >= this.config.excellentQualityThreshold) {
          currentWorkflow = improvedWorkflow;
          currentScore = newScore;
          return this.buildResult(iterations, 'excellent_quality', startTime, totalCost);
        }

        if (newScore.overall >= this.config.targetQualityScore) {
          currentWorkflow = improvedWorkflow;
          currentScore = newScore;
          return this.buildResult(iterations, 'target_reached', startTime, totalCost);
        }

        if (improvement <= 0) {
          logger.info({ improvement }, 'Stopping: no improvement in this iteration');
          return this.buildResult(iterations, 'no_improvement', startTime, totalCost);
        }

        if (improvement < this.config.minImprovementThreshold) {
          logger.info({
            improvement,
            threshold: this.config.minImprovementThreshold,
          }, 'Stopping: diminishing returns');
          currentWorkflow = improvedWorkflow;
          currentScore = newScore;
          return this.buildResult(iterations, 'diminishing_returns', startTime, totalCost);
        }

        // Continue with improved workflow
        currentWorkflow = improvedWorkflow;
        currentScore = newScore;

      } catch (error: any) {
        logger.error({ error, iteration: i }, 'Error during quality improvement iteration');
        // On error, return best result so far
        break;
      }
    }

    return this.buildResult(iterations, 'max_iterations', startTime, totalCost);
  }

  /**
   * Build a prompt that focuses on fixing specific quality issues
   */
  private buildImprovementPrompt(
    workflow: AIGeneratedWorkflow,
    score: QualityScore,
    originalRequest: AIWorkflowGenerationRequest
  ): string {
    // Group issues by category
    const issuesByCategory = new Map<string, typeof score.issues>();
    for (const issue of score.issues) {
      const list = issuesByCategory.get(issue.category) || [];
      list.push(issue);
      issuesByCategory.set(issue.category, list);
    }

    // Prioritize categories with most severe issues
    const prioritizedIssues: string[] = [];

    // Errors first
    const errors = score.issues.filter(i => i.type === 'error');
    if (errors.length > 0) {
      prioritizedIssues.push(`CRITICAL ERRORS (must fix):\n${errors.map(e => `- ${e.message}${e.suggestion ? ` (${e.suggestion})` : ''}`).join('\n')}`);
    }

    // Warnings second
    const warnings = score.issues.filter(i => i.type === 'warning');
    if (warnings.length > 0) {
      prioritizedIssues.push(`WARNINGS (should fix):\n${warnings.map(w => `- ${w.message}${w.suggestion ? ` (${w.suggestion})` : ''}`).join('\n')}`);
    }

    // Suggestions last
    const suggestions = score.issues.filter(i => i.type === 'suggestion');
    if (suggestions.length > 0 && prioritizedIssues.length < 10) {
      prioritizedIssues.push(`SUGGESTIONS (nice to have):\n${suggestions.slice(0, 5).map(s => `- ${s.message}`).join('\n')}`);
    }

    // Build category-specific guidance
    const categoryGuidance: string[] = [];

    if (score.breakdown.aliases < 80) {
      categoryGuidance.push(`ALIASES (score: ${score.breakdown.aliases}/100): Use descriptive camelCase aliases like "firstName", "emailAddress", "phoneNumber". Avoid generic names like "field1", "q1", "input".`);
    }

    if (score.breakdown.types < 80) {
      categoryGuidance.push(`TYPES (score: ${score.breakdown.types}/100): Use appropriate field types - "email" for email fields, "phone" for phone numbers, "currency" for money, "date" for dates, "scale" for ratings.`);
    }

    if (score.breakdown.structure < 80) {
      categoryGuidance.push(`STRUCTURE (score: ${score.breakdown.structure}/100): Organize into logical sections. Avoid empty sections or sections with too many steps (max 15). Group related questions together.`);
    }

    if (score.breakdown.ux < 80) {
      categoryGuidance.push(`UX (score: ${score.breakdown.ux}/100): Make question titles clear and descriptive. Add question marks to questions. Use helpful descriptions where needed.`);
    }

    if (score.breakdown.completeness < 80) {
      categoryGuidance.push(`COMPLETENESS (score: ${score.breakdown.completeness}/100): Ensure workflow has a title. Include all necessary input fields.`);
    }

    if (score.breakdown.validation < 80) {
      categoryGuidance.push(`VALIDATION (score: ${score.breakdown.validation}/100): Mark important fields as required. Ensure choice fields have at least 2 options.`);
    }

    return `You are a Workflow Quality Improvement Engine.

CURRENT WORKFLOW (Quality Score: ${score.overall}/100):
${JSON.stringify(workflow, null, 2)}

ORIGINAL USER REQUEST:
"${originalRequest.description}"

QUALITY ISSUES TO FIX:
${prioritizedIssues.join('\n\n')}

IMPROVEMENT GUIDANCE:
${categoryGuidance.join('\n')}

YOUR TASK:
Improve the workflow to fix the quality issues above. Focus on:
1. Fix ALL critical errors first
2. Address warnings where possible
3. Maintain the original workflow intent and structure
4. Keep all existing steps that are working well
5. Only modify what needs to be fixed

OUTPUT FORMAT:
Return ONLY a valid JSON object with the improved workflow structure:
{
  "title": "...",
  "description": "...",
  "sections": [...],
  "logicRules": [...],
  "transformBlocks": [...]
}

Do NOT include any explanation or markdown - just the JSON object.`;
  }

  /**
   * Parse the AI response into an improved workflow
   */
  private parseImprovedWorkflow(response: string, fallback: AIGeneratedWorkflow): AIGeneratedWorkflow {
    try {
      // Try to extract JSON from response
      let jsonStr = response.trim();

      // Handle markdown code blocks
      if (jsonStr.startsWith('```')) {
        const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
          jsonStr = match[1].trim();
        }
      }

      const parsed = JSON.parse(jsonStr);

      // Validate basic structure
      if (!parsed.sections || !Array.isArray(parsed.sections)) {
        logger.warn('Improved workflow missing sections array, using fallback');
        return fallback;
      }

      // Ensure required fields exist
      return {
        title: parsed.title || fallback.title,
        description: parsed.description || fallback.description,
        sections: parsed.sections,
        logicRules: parsed.logicRules || fallback.logicRules || [],
        transformBlocks: parsed.transformBlocks || fallback.transformBlocks || [],
        notes: parsed.notes || fallback.notes,
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to parse improved workflow, using fallback');
      return fallback;
    }
  }

  /**
   * Build the final result object
   */
  private buildResult(
    iterations: ImprovementIteration[],
    stoppedReason: ImprovementResult['stoppedReason'],
    startTime: number,
    totalCost: number
  ): ImprovementResult {
    const lastIteration = iterations[iterations.length - 1];
    const firstIteration = iterations[0];

    const result: ImprovementResult = {
      finalWorkflow: lastIteration.workflow,
      finalQualityScore: lastIteration.qualityScore,
      iterations,
      totalIterations: iterations.length - 1, // Exclude initial iteration 0
      totalDurationMs: Date.now() - startTime,
      totalEstimatedCostCents: totalCost,
      stoppedReason,
      qualityImprovement: lastIteration.qualityScore.overall - firstIteration.qualityScore.overall,
    };

    logger.info({
      finalScore: result.finalQualityScore.overall,
      totalIterations: result.totalIterations,
      totalDuration: result.totalDurationMs,
      totalCost: result.totalEstimatedCostCents,
      stoppedReason,
      qualityImprovement: result.qualityImprovement,
    }, 'Iterative quality improvement completed');

    return result;
  }

  /**
   * Quick check if a workflow needs improvement
   */
  needsImprovement(qualityScore: QualityScore): boolean {
    return qualityScore.overall < this.config.targetQualityScore;
  }

  /**
   * Estimate if improvement is worth the cost
   */
  estimateImprovementValue(currentScore: number): { worthIt: boolean; reason: string } {
    const potentialImprovement = this.config.targetQualityScore - currentScore;

    if (currentScore >= this.config.targetQualityScore) {
      return { worthIt: false, reason: 'Already at target quality' };
    }

    if (currentScore >= this.config.excellentQualityThreshold) {
      return { worthIt: false, reason: 'Already excellent quality' };
    }

    // Estimate iterations needed (rough heuristic)
    const estimatedIterations = Math.ceil(potentialImprovement / 10);
    const estimatedCost = estimatedIterations * this.config.estimatedCostPerIterationCents;

    if (estimatedCost > this.config.maxTotalCostCents) {
      return {
        worthIt: true,
        reason: `May need ${estimatedIterations} iterations (~${estimatedCost}¢), will cap at ${this.config.maxTotalCostCents}¢`,
      };
    }

    return {
      worthIt: true,
      reason: `Estimated ${estimatedIterations} iterations (~${estimatedCost}¢) to reach target`,
    };
  }
}

/**
 * Create an IterativeQualityImprover with default configuration
 */
export function createQualityImprover(
  client: AIProviderClient,
  promptBuilder: AIPromptBuilder,
  config?: Partial<QualityImprovementConfig>
): IterativeQualityImprover {
  return new IterativeQualityImprover(client, promptBuilder, config);
}

export default IterativeQualityImprover;
