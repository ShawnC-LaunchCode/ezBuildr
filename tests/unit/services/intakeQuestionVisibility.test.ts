/**
 * Tests for IntakeQuestionVisibilityService (Stage 20 PR 3)
 *
 * Tests question-level conditional visibility including:
 * - visibleIf conditions (question visibility)
 * - Validation filtering (required vs skipped)
 * - Hidden question value clearing
 * - Edge cases and error handling
 */
import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';
import type { Step, StepValue } from '@shared/schema';
import * as repositories from '../../../server/repositories';
import { IntakeQuestionVisibilityService } from '../../../server/services/IntakeQuestionVisibilityService';
import type { StepRepository, StepValueRepository } from '../../../server/repositories';

vi.mock('../../../server/repositories', () => ({
  stepRepository: {
    findBySectionIds: vi.fn(),
    findById: vi.fn(),
    findByWorkflowId: vi.fn(),
  },
  stepValueRepository: {
    findByRunId: vi.fn(),
    findByRunAndStep: vi.fn(),
    delete: vi.fn(),
    deleteWhere: vi.fn(),
    deleteByIdsForRun: vi.fn(),
  },
}));

describe('IntakeQuestionVisibilityService', () => {
  let service: IntakeQuestionVisibilityService;
  let mockStepRepo: Mocked<StepRepository>;
  let mockStepValueRepo: Mocked<StepValueRepository>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockStepRepo = repositories.stepRepository as Mocked<StepRepository>;
    mockStepValueRepo = repositories.stepValueRepository as Mocked<StepValueRepository>;

    service = new IntakeQuestionVisibilityService(
      mockStepRepo,
      mockStepValueRepo
    );
  });
  // ========================================================================
  // BASIC VISIBILITY (NO CONDITIONS)
  // ========================================================================
  describe('Basic visibility (no conditions)', () => {
    it('should return all questions as visible when no conditions', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Q1', order: 0, isVirtual: false, visibleIf: null },
        { id: 'q2', sectionId: 'section1', title: 'Q2', order: 1, isVirtual: false, visibleIf: null },
        { id: 'q3', sectionId: 'section1', title: 'Q3', order: 2, isVirtual: false, visibleIf: null },
      ] as unknown as Step[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue([]);
      const result = await service.evaluatePageQuestions('section1', 'run1');
      expect(result.allQuestions).toEqual(['q1', 'q2', 'q3']);
      expect(result.visibleQuestions).toEqual(['q1', 'q2', 'q3']);
      expect(result.hiddenQuestions).toEqual([]);
    });
    it('should exclude virtual steps from visibility evaluation', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Q1', order: 0, isVirtual: false, visibleIf: null },
        { id: 'virtual1', sectionId: 'section1', title: 'Virtual', order: 1, isVirtual: true, visibleIf: null },
        { id: 'q2', sectionId: 'section1', title: 'Q2', order: 2, isVirtual: false, visibleIf: null },
      ] as unknown as Step[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue([]);
      const result = await service.evaluatePageQuestions('section1', 'run1');
      expect(result.allQuestions).toEqual(['q1', 'q2']); // virtual1 excluded
      expect(result.visibleQuestions).toEqual(['q1', 'q2']);
    });
    it('should maintain question order', async () => {
      const mockQuestions = [
        { id: 'q3', sectionId: 'section1', title: 'Q3', order: 2, isVirtual: false, visibleIf: null },
        { id: 'q1', sectionId: 'section1', title: 'Q1', order: 0, isVirtual: false, visibleIf: null },
        { id: 'q2', sectionId: 'section1', title: 'Q2', order: 1, isVirtual: false, visibleIf: null },
      ] as unknown as Step[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue([]);
      const result = await service.evaluatePageQuestions('section1', 'run1');
      expect(result.visibleQuestions).toEqual(['q1', 'q2', 'q3']); // Sorted by order
    });
  });

  // ========================================================================
  // CROSS-PAGE ALIAS VISIBILITY — hidden-but-required dead-end regression.
  // A page-2 visibleIf referencing a page-1 answer by alias must resolve, so
  // the server hides (and skips validating) the field just like the client.
  // ========================================================================
  describe('Cross-page alias visibility', () => {
    // Page 2's required "spouse name" is only shown when marital status
    // (answered on page 1, referenced by its alias) is not "single".
    const spouseStep = {
      id: 'q_spouse', sectionId: 'page2', workflowId: 'wf1', title: 'Spouse name',
      order: 0, isVirtual: false, required: true,
      visibleIf: {
        type: 'group', id: 'g1', operator: 'AND',
        conditions: [
          { type: 'condition', id: 'c1', variable: 'maritalStatus', operator: 'not_equals', value: 'single', valueType: 'constant' },
        ],
      },
    } as unknown as Step;
    const maritalStep = {
      id: 'q_marital', sectionId: 'page1', workflowId: 'wf1', title: 'Marital status',
      order: 0, isVirtual: false, required: true, alias: 'maritalStatus', visibleIf: null,
    } as unknown as Step;

    beforeEach(() => {
      // The current page (page2) only contains the spouse question...
      mockStepRepo.findBySectionIds.mockResolvedValue([spouseStep]);
      // ...but the alias map is built from the whole workflow (both pages).
      mockStepRepo.findByWorkflowId.mockResolvedValue([maritalStep, spouseStep]);
    });

    it('hides the page-2 field when the page-1 alias answer makes the condition false', async () => {
      mockStepValueRepo.findByRunId.mockResolvedValue([
        { stepId: 'q_marital', value: 'single' } as unknown as StepValue,
      ]);
      const result = await service.evaluatePageQuestions('page2', 'run1');
      expect(result.hiddenQuestions).toContain('q_spouse');
      expect(result.visibleQuestions).not.toContain('q_spouse');
    });

    it('does NOT require a field it has hidden (no dead-end on submit validation)', async () => {
      mockStepValueRepo.findByRunId.mockResolvedValue([
        { stepId: 'q_marital', value: 'single' } as unknown as StepValue,
      ]);
      const filter = await service.getValidationFilter('page2', 'run1');
      expect(filter.skippedQuestions).toContain('q_spouse');
      expect(filter.requiredQuestions).not.toContain('q_spouse');
    });

    it('shows and requires the page-2 field when the page-1 alias answer makes the condition true', async () => {
      mockStepValueRepo.findByRunId.mockResolvedValue([
        { stepId: 'q_marital', value: 'married' } as unknown as StepValue,
      ]);
      const result = await service.evaluatePageQuestions('page2', 'run1');
      expect(result.visibleQuestions).toContain('q_spouse');
      const filter = await service.getValidationFilter('page2', 'run1');
      expect(filter.requiredQuestions).toContain('q_spouse');
    });
  });
  // ========================================================================
  // VISIBLEIF CONDITIONS
  // ========================================================================
  describe('visibleIf conditions', () => {
    it('should hide questions when visibleIf is false', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Q1', order: 0, isVirtual: false, alias: 'married', visibleIf: null },
        {
          id: 'q2',
          sectionId: 'section1',
          title: 'Spouse Name',
          order: 1,
          isVirtual: false,
          alias: 'spouseName',
          visibleIf: {
            op: 'equals',
            left: { type: 'variable', path: 'married' },
            right: { type: 'value', value: true },
          },
        },
      ] as unknown as Step[];
      const mockValues = [
        { runId: 'run1', stepId: 'q1', value: false }, // married = false
      ] as unknown as StepValue[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues);
      const result = await service.evaluatePageQuestions('section1', 'run1');
      expect(result.visibleQuestions).toEqual(['q1']); // q2 hidden
      expect(result.hiddenQuestions).toEqual(['q2']);
    });
    it('should show questions when visibleIf is true', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Q1', order: 0, isVirtual: false, alias: 'married', visibleIf: null },
        {
          id: 'q2',
          sectionId: 'section1',
          title: 'Spouse Name',
          order: 1,
          isVirtual: false,
          alias: 'spouseName',
          visibleIf: {
            op: 'equals',
            left: { type: 'variable', path: 'married' },
            right: { type: 'value', value: true },
          },
        },
      ] as unknown as Step[];
      const mockValues = [
        { runId: 'run1', stepId: 'q1', value: true }, // married = true
      ] as unknown as StepValue[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues);
      const result = await service.evaluatePageQuestions('section1', 'run1');
      expect(result.visibleQuestions).toEqual(['q1', 'q2']); // Both visible
      expect(result.hiddenQuestions).toEqual([]);
    });
    it('should handle complex visibleIf conditions', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Age', order: 0, isVirtual: false, alias: 'age', visibleIf: null },
        { id: 'q2', sectionId: 'section1', title: 'Income', order: 1, isVirtual: false, alias: 'income', visibleIf: null },
        {
          id: 'q3',
          sectionId: 'section1',
          title: 'Investment Options',
          order: 2,
          isVirtual: false,
          alias: 'investments',
          visibleIf: {
            and: [
              { op: 'gte', left: { type: 'variable', path: 'age' }, right: { type: 'value', value: 18 } },
              { op: 'gt', left: { type: 'variable', path: 'income' }, right: { type: 'value', value: 50000 } },
            ],
          },
        },
      ] as unknown as Step[];
      const mockValues = [
        { runId: 'run1', stepId: 'q1', value: 25 },
        { runId: 'run1', stepId: 'q2', value: 75000 },
      ] as unknown as StepValue[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues);
      const result = await service.evaluatePageQuestions('section1', 'run1');
      expect(result.visibleQuestions).toEqual(['q1', 'q2', 'q3']); // All visible (conditions met)
    });
    it('should handle OR conditions', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Role', order: 0, isVirtual: false, alias: 'role', visibleIf: null },
        {
          id: 'q2',
          sectionId: 'section1',
          title: 'Admin Panel',
          order: 1,
          isVirtual: false,
          visibleIf: {
            or: [
              { op: 'equals', left: { type: 'variable', path: 'role' }, right: { type: 'value', value: 'admin' } },
              { op: 'equals', left: { type: 'variable', path: 'role' }, right: { type: 'value', value: 'manager' } },
            ],
          },
        },
      ] as unknown as Step[];
      const mockValues = [
        { runId: 'run1', stepId: 'q1', value: 'manager' },
      ] as unknown as StepValue[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues);
      const result = await service.evaluatePageQuestions('section1', 'run1');
      expect(result.visibleQuestions).toEqual(['q1', 'q2']); // q2 visible (manager matches OR condition)
    });
    it('should handle NOT conditions', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Status', order: 0, isVirtual: false, alias: 'status', visibleIf: null },
        {
          id: 'q2',
          sectionId: 'section1',
          title: 'Standard Form',
          order: 1,
          isVirtual: false,
          visibleIf: {
            not: {
              op: 'equals',
              left: { type: 'variable', path: 'status' },
              right: { type: 'value', value: 'banned' },
            },
          },
        },
      ] as unknown as Step[];
      const mockValues = [
        { runId: 'run1', stepId: 'q1', value: 'active' },
      ] as unknown as StepValue[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues);
      const result = await service.evaluatePageQuestions('section1', 'run1');
      expect(result.visibleQuestions).toEqual(['q1', 'q2']); // q2 visible (NOT banned)
    });
  });
  // ========================================================================
  // VALIDATION FILTERING
  // ========================================================================
  describe('Validation filtering', () => {
    it('should include visible required questions in validation', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Q1', order: 0, required: true, isVirtual: false, visibleIf: null },
        { id: 'q2', sectionId: 'section1', title: 'Q2', order: 1, required: false, isVirtual: false, visibleIf: null },
        { id: 'q3', sectionId: 'section1', title: 'Q3', order: 2, required: true, isVirtual: false, visibleIf: null },
      ] as unknown as Step[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue([]);
      const result = await service.getValidationFilter('section1', 'run1');
      expect(result.requiredQuestions).toEqual(['q1', 'q3']);
      expect(result.skippedQuestions).toEqual([]);
    });
    it('should skip hidden questions in validation', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Q1', order: 0, required: true, isVirtual: false, alias: 'show', visibleIf: null },
        {
          id: 'q2',
          sectionId: 'section1',
          title: 'Q2',
          order: 1,
          required: true,
          isVirtual: false,
          visibleIf: {
            op: 'equals',
            left: { type: 'variable', path: 'show' },
            right: { type: 'value', value: true },
          },
        },
      ] as unknown as Step[];
      const mockValues = [
        { runId: 'run1', stepId: 'q1', value: false }, // show = false
      ] as unknown as StepValue[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues);
      const result = await service.getValidationFilter('section1', 'run1');
      expect(result.requiredQuestions).toEqual(['q1']); // q2 hidden, so not required
      expect(result.skippedQuestions).toEqual(['q2']);
    });
  });
  // ========================================================================
  // HELPER METHODS
  // ========================================================================
  describe('Helper methods', () => {
    it('should check if question is visible', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Q1', order: 0, isVirtual: false, alias: 'show', visibleIf: null },
        {
          id: 'q2',
          sectionId: 'section1',
          title: 'Q2',
          order: 1,
          isVirtual: false,
          visibleIf: {
            op: 'equals',
            left: { type: 'variable', path: 'show' },
            right: { type: 'value', value: true },
          },
        },
      ] as unknown as Step[];
      const mockValues = [
        { runId: 'run1', stepId: 'q1', value: false },
      ] as unknown as StepValue[];

      mockStepRepo.findById.mockResolvedValue(mockQuestions[1]); // Return q2
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions); // Return all for evaluatePageQuestions
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues);

      const isVisible = await service.isQuestionVisible('q2', 'run1');
      expect(isVisible).toBe(false); // q2 hidden
    });
    it('should get visible question count', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Q1', order: 0, isVirtual: false, alias: 'show', visibleIf: null },
        {
          id: 'q2',
          sectionId: 'section1',
          title: 'Q2',
          order: 1,
          isVirtual: false,
          visibleIf: {
            op: 'equals',
            left: { type: 'variable', path: 'show' },
            right: { type: 'value', value: true },
          },
        },
        { id: 'q3', sectionId: 'section1', title: 'Q3', order: 2, isVirtual: false, visibleIf: null },
      ] as unknown as Step[];
      const mockValues = [
        { runId: 'run1', stepId: 'q1', value: true }, // show = true
      ] as unknown as StepValue[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues);

      const count = await service.getVisibleQuestionCount('section1', 'run1');
      expect(count).toBe(3); // All visible
    });
  });
  // ========================================================================
  // VALUE CLEARING
  // ========================================================================
  describe('Hidden question value clearing', () => {
    it('should clear values for hidden questions', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Q1', order: 0, isVirtual: false, alias: 'show', visibleIf: null },
        {
          id: 'q2',
          sectionId: 'section1',
          title: 'Q2',
          order: 1,
          isVirtual: false,
          visibleIf: {
            op: 'equals',
            left: { type: 'variable', path: 'show' },
            right: { type: 'value', value: true },
          },
        },
      ] as unknown as Step[];
      const mockValues = [
        { runId: 'run1', stepId: 'q1', value: false }, // show = false
        { id: 'value123', runId: 'run1', stepId: 'q2', value: 'old answer' }, // Existing value to clear
      ] as unknown as StepValue[];
      const mockExistingValue = { id: 'value123', runId: 'run1', stepId: 'q2', value: 'old answer' } as unknown as StepValue;
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues);
      mockStepValueRepo.findByRunAndStep.mockResolvedValue(mockExistingValue);
      mockStepValueRepo.deleteByIdsForRun.mockResolvedValue(undefined);
      const runId = 'run_clear_values'; // Unique run ID
      const cleared = await service.clearHiddenQuestionValues('section1', runId);
      expect(cleared).toEqual(['q2']);
      expect(mockStepValueRepo.deleteByIdsForRun).toHaveBeenCalledWith(runId, ['value123']);
    });
    it('should not clear values for visible questions', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Q1', order: 0, isVirtual: false, visibleIf: null },
        { id: 'q2', sectionId: 'section1', title: 'Q2', order: 1, isVirtual: false, visibleIf: null },
      ] as unknown as Step[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue([]);
      const runId = 'run_no_clear'; // Unique run ID
      const cleared = await service.clearHiddenQuestionValues('section1', runId);
      expect(cleared).toEqual([]);
      expect(mockStepValueRepo.delete).not.toHaveBeenCalled();
      expect(mockStepValueRepo.deleteWhere).not.toHaveBeenCalled();
      expect(mockStepValueRepo.deleteByIdsForRun).not.toHaveBeenCalled();
    });
  });
  // ========================================================================
  // VALIDATION
  // ========================================================================
  describe('Validation warnings', () => {
    it('should warn if required question has visibility condition', async () => {
      const mockQuestions = [
        {
          id: 'q1',
          sectionId: 'section1',
          title: 'SSN',
          required: true,
          isVirtual: false,
          visibleIf: {
            op: 'equals',
            left: { type: 'variable', path: 'country' },
            right: { type: 'value', value: 'USA' },
          },
        },
      ] as unknown as Step[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      const warnings = await service.validateQuestionConditions('section1');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('required');
      expect(warnings[0]).toContain('visibleIf');
    });
    it('should warn if virtual step has visibility condition', async () => {
      const mockQuestions = [
        {
          id: 'virtual1',
          sectionId: 'section1',
          title: 'Computed',
          required: false,
          isVirtual: true,
          visibleIf: {
            op: 'equals',
            left: { type: 'variable', path: 'show' },
            right: { type: 'value', value: true },
          },
        },
      ] as unknown as Step[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      const warnings = await service.validateQuestionConditions('section1');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Virtual step');
      expect(warnings[0]).toContain('unnecessary');
    });
    it('should return no warnings for valid configuration', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Q1', required: false, isVirtual: false, visibleIf: null },
        {
          id: 'q2',
          sectionId: 'section1',
          title: 'Q2',
          required: false,
          isVirtual: false,
          visibleIf: {
            op: 'equals',
            left: { type: 'variable', path: 'show' },
            right: { type: 'value', value: true },
          },
        },
      ] as unknown as Step[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      const warnings = await service.validateQuestionConditions('section1');
      expect(warnings).toEqual([]);
    });
  });
  // ========================================================================
  // ERROR HANDLING
  // ========================================================================
  describe('Error handling', () => {
    it('should default to visible on condition evaluation error', async () => {
      const mockQuestions = [
        {
          id: 'q1',
          sectionId: 'section1',
          title: 'Q1',
          order: 0,
          isVirtual: false,
          visibleIf: { op: 'invalid', left: null, right: null }, // Invalid condition
        },
      ] as unknown as Step[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue([]);
      const result = await service.evaluatePageQuestions('section1', 'run1');
      // Should default to visible (fail-safe)
      expect(result.visibleQuestions).toEqual(['q1']);
      expect(result.hiddenQuestions).toEqual([]);
      expect(result.visibilityReasons.get('q1')).toContain('error');
    });
  });
  // ========================================================================
  // ICW2-B10: id/alias dual-keying
  // ========================================================================
  describe('ICW2-B10: controlling step resolvable by id OR alias', () => {
    it('resolves a visibleIf condition that references the controlling step by its raw step id, even though that step also has an alias', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Do you agree?', order: 0, isVirtual: false, alias: 'agree', visibleIf: null },
        {
          id: 'q2',
          sectionId: 'section1',
          title: 'Preferred start date',
          order: 1,
          isVirtual: false,
          alias: 'preferredStartDate',
          visibleIf: {
            // References the controlling step by its raw id, not its alias.
            op: 'equals',
            left: { type: 'variable', path: 'q1' },
            right: { type: 'value', value: true },
          },
        },
      ] as unknown as Step[];
      const mockValues = [
        { runId: 'run1', stepId: 'q1', value: true },
      ] as unknown as StepValue[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues);

      const result = await service.evaluatePageQuestions('section1', 'run1');

      expect(result.visibleQuestions).toEqual(['q1', 'q2']);
      expect(result.hiddenQuestions).toEqual([]);
    });

    it('still resolves a visibleIf condition that references the controlling step by alias', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Do you agree?', order: 0, isVirtual: false, alias: 'agree', visibleIf: null },
        {
          id: 'q2',
          sectionId: 'section1',
          title: 'Preferred start date',
          order: 1,
          isVirtual: false,
          alias: 'preferredStartDate',
          visibleIf: {
            op: 'equals',
            left: { type: 'variable', path: 'agree' },
            right: { type: 'value', value: true },
          },
        },
      ] as unknown as Step[];
      const mockValues = [
        { runId: 'run1', stepId: 'q1', value: true },
      ] as unknown as StepValue[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues);

      const result = await service.evaluatePageQuestions('section1', 'run1');

      expect(result.visibleQuestions).toEqual(['q1', 'q2']);
      expect(result.hiddenQuestions).toEqual([]);
    });
  });

  // ========================================================================
  // CASCADING VISIBILITY
  // ========================================================================
  describe('Cascading visibility', () => {
    it('should handle questions that depend on each other', async () => {
      const mockQuestions = [
        { id: 'q1', sectionId: 'section1', title: 'Has Spouse', order: 0, isVirtual: false, alias: 'hasSpouse', visibleIf: null },
        {
          id: 'q2',
          sectionId: 'section1',
          title: 'Spouse Name',
          order: 1,
          isVirtual: false,
          alias: 'spouseName',
          visibleIf: {
            op: 'equals',
            left: { type: 'variable', path: 'hasSpouse' },
            right: { type: 'value', value: true },
          },
        },
        {
          id: 'q3',
          sectionId: 'section1',
          title: 'Spouse Age',
          order: 2,
          isVirtual: false,
          alias: 'spouseAge',
          visibleIf: {
            op: 'notEmpty',
            left: { type: 'variable', path: 'spouseName' },
            right: { type: 'value', value: null },
          },
        },
      ] as unknown as Step[];
      // Scenario 1: hasSpouse = false → q2 and q3 hidden
      const mockValues1 = [
        { runId: 'run1', stepId: 'q1', value: false },
      ] as unknown as StepValue[];
      mockStepRepo.findBySectionIds.mockResolvedValue(mockQuestions);
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues1);
      const result1 = await service.evaluatePageQuestions('section1', 'run1');
      expect(result1.hiddenQuestions).toEqual(['q2', 'q3']);
      // Clear cache to force re-evaluation
      service.clearCache('run1');
      // Scenario 2: hasSpouse = true, spouseName = "John" → all visible
      const mockValues2 = [
        { runId: 'run1', stepId: 'q1', value: true },
        { runId: 'run1', stepId: 'q2', value: 'John' },
      ] as unknown as StepValue[];
      mockStepValueRepo.findByRunId.mockResolvedValue(mockValues2);
      const result2 = await service.evaluatePageQuestions('section1', 'run1');
      expect(result2.visibleQuestions).toEqual(['q1', 'q2', 'q3']); // All visible
    });
  });
});
