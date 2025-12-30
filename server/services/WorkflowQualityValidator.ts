/**
 * Workflow Quality Validator
 *
 * Validates AI-generated workflows for quality, completeness, and best practices.
 * Provides detailed scoring and actionable feedback for improvement.
 */

import type { AIGeneratedWorkflow, AIGeneratedStep, AIGeneratedSection } from '../../shared/types/ai';
import { createLogger } from '../logger';

const logger = createLogger({ module: 'workflow-quality-validator' });

export interface QualityIssue {
  type: 'error' | 'warning' | 'suggestion';
  category: 'aliases' | 'types' | 'structure' | 'ux' | 'completeness' | 'validation';
  message: string;
  location?: string; // e.g., "sections[0].steps[2]"
  suggestion?: string;
}

export interface QualityScore {
  overall: number; // 0-100
  breakdown: {
    aliases: number;      // Descriptive, meaningful aliases
    types: number;        // Appropriate field types
    structure: number;    // Logical organization
    ux: number;          // User experience quality
    completeness: number; // Has all necessary fields
    validation: number;   // Proper validation setup
  };
  issues: QualityIssue[];
  passed: boolean; // true if overall >= 70
  suggestions: string[];
}

export class WorkflowQualityValidator {
  private readonly MIN_PASSING_SCORE = 70;
  private readonly GENERIC_ALIAS_PATTERNS = [
    /^(field|question|step|input|item|data|value)\d*$/i,
    /^(q|s|f|i)\d+$/i,
    /^step_\d+$/i,
    /^question_\d+$/i,
  ];

  /**
   * Validate workflow quality and return detailed score
   */
  validate(workflow: AIGeneratedWorkflow): QualityScore {
    const issues: QualityIssue[] = [];

    // Run all quality checks
    this.checkAliasQuality(workflow, issues);
    this.checkTypeAppropriateneness(workflow, issues);
    this.checkStructuralQuality(workflow, issues);
    this.checkUserExperience(workflow, issues);
    this.checkCompleteness(workflow, issues);
    this.checkValidationSetup(workflow, issues);

    // Calculate scores
    const breakdown = this.calculateBreakdown(issues);
    const overall = this.calculateOverallScore(breakdown);
    const passed = overall >= this.MIN_PASSING_SCORE;
    const suggestions = this.generateSuggestions(issues);

    logger.info({
      overall,
      breakdown,
      issuesCount: issues.length,
      passed,
    }, 'Workflow quality validation completed');

    return {
      overall,
      breakdown,
      issues,
      passed,
      suggestions,
    };
  }

  /**
   * Check 1: Alias Quality
   * Aliases should be descriptive, camelCase, and unique
   */
  private checkAliasQuality(workflow: AIGeneratedWorkflow, issues: QualityIssue[]): void {
    const seenAliases = new Set<string>();

    workflow.sections.forEach((section, sIdx) => {
      section.steps.forEach((step, stepIdx) => {
        const location = `sections[${sIdx}].steps[${stepIdx}]`;

        // Check for missing alias
        if (!step.alias || step.alias.trim() === '') {
          issues.push({
            type: 'error',
            category: 'aliases',
            message: `Step "${step.title}" is missing an alias`,
            location,
            suggestion: 'Generate a camelCase alias based on the step title',
          });
          return;
        }

        // Check for generic aliases
        const isGeneric = this.GENERIC_ALIAS_PATTERNS.some(pattern =>
          pattern.test(step.alias!)
        );

        if (isGeneric) {
          issues.push({
            type: 'error',
            category: 'aliases',
            message: `Generic alias "${step.alias}" for step "${step.title}"`,
            location,
            suggestion: `Use a descriptive name like "${this.suggestAlias(step.title)}"`,
          });
        }

        // Check for too short aliases
        if (step.alias.length < 3) {
          issues.push({
            type: 'warning',
            category: 'aliases',
            message: `Alias "${step.alias}" is too short for step "${step.title}"`,
            location,
            suggestion: 'Use at least 3 characters for clarity',
          });
        }

        // Check for non-camelCase
        if (!/^[a-z][a-zA-Z0-9]*$/.test(step.alias)) {
          issues.push({
            type: 'warning',
            category: 'aliases',
            message: `Alias "${step.alias}" is not in camelCase format`,
            location,
            suggestion: 'Use camelCase (e.g., "firstName", "phoneNumber")',
          });
        }

        // Check for duplicates
        if (seenAliases.has(step.alias)) {
          issues.push({
            type: 'error',
            category: 'aliases',
            message: `Duplicate alias "${step.alias}"`,
            location,
            suggestion: 'Each alias must be unique across the workflow',
          });
        }
        seenAliases.add(step.alias);
      });
    });
  }

  /**
   * Check 2: Type Appropriateness
   * Use correct field types based on step title/purpose
   */
  private checkTypeAppropriateneness(workflow: AIGeneratedWorkflow, issues: QualityIssue[]): void {
    const typeHints: Array<{ keywords: string[]; expectedType: string; reason: string }> = [
      {
        keywords: ['email', 'e-mail', 'email address'],
        expectedType: 'email',
        reason: 'Email fields should use "email" type for validation',
      },
      {
        keywords: ['phone', 'telephone', 'mobile', 'cell'],
        expectedType: 'phone',
        reason: 'Phone fields should use "phone" type for formatting',
      },
      {
        keywords: ['website', 'url', 'link', 'homepage'],
        expectedType: 'website',
        reason: 'URL fields should use "website" type for validation',
      },
      {
        keywords: ['address', 'street', 'city', 'zip', 'postal'],
        expectedType: 'address',
        reason: 'Address fields should use "address" type for structured input',
      },
      {
        keywords: ['date', 'birthday', 'born', 'when'],
        expectedType: 'date',
        reason: 'Date fields should use "date" type for date picker',
      },
      {
        keywords: ['price', 'cost', 'amount', 'salary', 'fee', '$'],
        expectedType: 'currency',
        reason: 'Money fields should use "currency" type for formatting',
      },
      {
        keywords: ['rating', 'score', 'rate'],
        expectedType: 'scale',
        reason: 'Rating fields should use "scale" type for better UX',
      },
    ];

    workflow.sections.forEach((section, sIdx) => {
      section.steps.forEach((step, stepIdx) => {
        const location = `sections[${sIdx}].steps[${stepIdx}]`;
        const titleLower = step.title.toLowerCase();

        for (const hint of typeHints) {
          const hasKeyword = hint.keywords.some(kw => titleLower.includes(kw));

          if (hasKeyword && step.type !== hint.expectedType) {
            issues.push({
              type: 'warning',
              category: 'types',
              message: `Step "${step.title}" should probably use type "${hint.expectedType}" instead of "${step.type}"`,
              location,
              suggestion: hint.reason,
            });
          }
        }

        // Check for multiple choice without options
        if (['radio', 'multiple_choice', 'choice'].includes(step.type)) {
          const options = step.config?.options;
          if (!options || !Array.isArray(options) || options.length < 2) {
            issues.push({
              type: 'error',
              category: 'validation',
              message: `Step "${step.title}" is type "${step.type}" but has no options`,
              location,
              suggestion: 'Provide at least 2 options in config.options array',
            });
          }
        }
      });
    });
  }

  /**
   * Check 3: Structural Quality
   * Sections should be logically organized and reasonably sized
   */
  private checkStructuralQuality(workflow: AIGeneratedWorkflow, issues: QualityIssue[]): void {
    // Check for empty sections
    workflow.sections.forEach((section, sIdx) => {
      if (!section.steps || section.steps.length === 0) {
        issues.push({
          type: 'error',
          category: 'structure',
          message: `Section "${section.title}" has no steps`,
          location: `sections[${sIdx}]`,
          suggestion: 'Each section should have at least one step',
        });
      }

      // Check for overly large sections (poor UX)
      if (section.steps.length > 15) {
        issues.push({
          type: 'warning',
          category: 'structure',
          message: `Section "${section.title}" has ${section.steps.length} steps (too many)`,
          location: `sections[${sIdx}]`,
          suggestion: 'Consider breaking into multiple sections for better UX',
        });
      }
    });

    // Check for single-section workflows (may be poorly structured)
    if (workflow.sections.length === 1 && workflow.sections[0].steps.length > 5) {
      issues.push({
        type: 'suggestion',
        category: 'structure',
        message: 'Workflow has only one section with multiple steps',
        suggestion: 'Consider grouping related steps into logical sections',
      });
    }
  }

  /**
   * Check 4: User Experience
   * Questions should be clear and well-organized
   */
  private checkUserExperience(workflow: AIGeneratedWorkflow, issues: QualityIssue[]): void {
    workflow.sections.forEach((section, sIdx) => {
      section.steps.forEach((step, stepIdx) => {
        const location = `sections[${sIdx}].steps[${stepIdx}]`;

        // Check for vague titles
        if (step.title.length < 10) {
          issues.push({
            type: 'suggestion',
            category: 'ux',
            message: `Step title "${step.title}" is quite short`,
            location,
            suggestion: 'Consider making it more descriptive for clarity',
          });
        }

        // Check for missing question marks (if it's a question)
        const seemsLikeQuestion = /^(what|when|where|who|which|how|do|does|is|are|can|will)/i.test(step.title);
        if (seemsLikeQuestion && !step.title.includes('?')) {
          issues.push({
            type: 'suggestion',
            category: 'ux',
            message: `Step "${step.title}" appears to be a question but missing "?"`,
            location,
            suggestion: 'Add question mark for clarity',
          });
        }
      });
    });
  }

  /**
   * Check 5: Completeness
   * Workflow should have all necessary components
   */
  private checkCompleteness(workflow: AIGeneratedWorkflow, issues: QualityIssue[]): void {
    // Check for missing workflow title
    if (!workflow.title || workflow.title.trim() === '') {
      issues.push({
        type: 'error',
        category: 'completeness',
        message: 'Workflow is missing a title',
        suggestion: 'Add a descriptive title for the workflow',
      });
    }

    // Check if workflow collects any data
    const hasInputSteps = workflow.sections.some(s =>
      s.steps.some(step => !['display', 'display_advanced'].includes(step.type))
    );

    if (!hasInputSteps) {
      issues.push({
        type: 'warning',
        category: 'completeness',
        message: 'Workflow has no input fields (only display steps)',
        suggestion: 'Add input fields to collect data',
      });
    }
  }

  /**
   * Check 6: Validation Setup
   * Steps should have appropriate validation
   */
  private checkValidationSetup(workflow: AIGeneratedWorkflow, issues: QualityIssue[]): void {
    workflow.sections.forEach((section, sIdx) => {
      section.steps.forEach((step, stepIdx) => {
        const location = `sections[${sIdx}].steps[${stepIdx}]`;

        // Check if important fields are marked required
        const titleLower = step.title.toLowerCase();
        const seemsImportant = ['name', 'email', 'phone', 'address'].some(kw =>
          titleLower.includes(kw)
        );

        if (seemsImportant && step.required === false) {
          issues.push({
            type: 'suggestion',
            category: 'validation',
            message: `Step "${step.title}" seems important but is not required`,
            location,
            suggestion: 'Consider making essential fields required',
          });
        }
      });
    });
  }

  /**
   * Calculate category scores based on issues
   */
  private calculateBreakdown(issues: QualityIssue[]): QualityScore['breakdown'] {
    const categories = ['aliases', 'types', 'structure', 'ux', 'completeness', 'validation'] as const;
    const breakdown: any = {};

    for (const category of categories) {
      const categoryIssues = issues.filter(i => i.category === category);
      const errorCount = categoryIssues.filter(i => i.type === 'error').length;
      const warningCount = categoryIssues.filter(i => i.type === 'warning').length;
      const suggestionCount = categoryIssues.filter(i => i.type === 'suggestion').length;

      // Scoring: errors -20, warnings -10, suggestions -5
      const deductions = (errorCount * 20) + (warningCount * 10) + (suggestionCount * 5);
      breakdown[category] = Math.max(0, 100 - deductions);
    }

    return breakdown;
  }

  /**
   * Calculate overall score (weighted average)
   */
  private calculateOverallScore(breakdown: QualityScore['breakdown']): number {
    const weights = {
      aliases: 0.25,      // 25% - Very important
      types: 0.20,        // 20% - Important for validation
      structure: 0.15,    // 15% - Important for UX
      ux: 0.15,          // 15% - Important for users
      completeness: 0.15, // 15% - Important for functionality
      validation: 0.10,   // 10% - Good to have
    };

    let weightedSum = 0;
    for (const [category, weight] of Object.entries(weights)) {
      weightedSum += breakdown[category as keyof typeof breakdown] * weight;
    }

    return Math.round(weightedSum);
  }

  /**
   * Generate actionable suggestions
   */
  private generateSuggestions(issues: QualityIssue[]): string[] {
    const suggestions: string[] = [];
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;

    if (errorCount > 0) {
      suggestions.push(`Fix ${errorCount} error${errorCount > 1 ? 's' : ''} to improve workflow quality`);
    }

    if (warningCount > 0) {
      suggestions.push(`Address ${warningCount} warning${warningCount > 1 ? 's' : ''} for better user experience`);
    }

    // Specific suggestions based on issue patterns
    const aliasIssues = issues.filter(i => i.category === 'aliases').length;
    if (aliasIssues > 3) {
      suggestions.push('Consider regenerating with more emphasis on descriptive field names');
    }

    const typeIssues = issues.filter(i => i.category === 'types').length;
    if (typeIssues > 2) {
      suggestions.push('Use specialized field types (email, phone, currency) instead of generic text fields');
    }

    return suggestions;
  }

  /**
   * Suggest a camelCase alias based on title
   */
  private suggestAlias(title: string): string {
    // Remove common prefixes
    let cleaned = title.replace(/^(what is|what's|enter|provide|select|choose)\s+/i, '');

    // Remove question marks and punctuation
    cleaned = cleaned.replace(/[?!.,;:]/g, '');

    // Convert to camelCase
    const words = cleaned.trim().split(/\s+/);
    if (words.length === 0) return 'field';

    return words
      .map((word, idx) => {
        word = word.toLowerCase();
        if (idx === 0) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join('');
  }
}

// Export singleton instance
export const workflowQualityValidator = new WorkflowQualityValidator();
