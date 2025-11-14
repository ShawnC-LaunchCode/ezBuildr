/**
 * Tests for IntakeNavigationService (Stage 20 PR 2)
 *
 * Tests page-level conditional navigation including:
 * - visibleIf conditions (page visibility)
 * - skipIf conditions (automatic page skipping)
 * - Navigation calculation (next/previous)
 * - Progress calculation
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntakeNavigationService } from '../../../server/services/IntakeNavigationService';
import * as repositories from '../../../server/repositories';

// Mock the repositories
vi.mock('../../../server/repositories', () => ({
  sectionRepository: {
    findByWorkflowId: vi.fn(),
  },
  stepRepository: {
    findByWorkflowId: vi.fn(),
  },
  stepValueRepository: {
    findByRunId: vi.fn(),
  },
}));

describe('IntakeNavigationService', () => {
  let service: IntakeNavigationService;

  beforeEach(() => {
    service = new IntakeNavigationService();
    vi.clearAllMocks();
  });

  // ========================================================================
  // BASIC NAVIGATION (NO CONDITIONS)
  // ========================================================================

  describe('Basic navigation (no conditions)', () => {
    it('should return all pages in order when no conditions', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        { id: 'page2', workflowId: 'wf1', title: 'Page 2', order: 1, visibleIf: null, skipIf: null },
        { id: 'page3', workflowId: 'wf1', title: 'Page 3', order: 2, visibleIf: null, skipIf: null },
      ];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue([]);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue([]);

      const result = await service.evaluateNavigation('wf1', 'run1', null);

      expect(result.visiblePages).toEqual(['page1', 'page2', 'page3']);
      expect(result.currentPageIndex).toBe(0);
      expect(result.nextPageId).toBe('page2');
      expect(result.previousPageId).toBe(null);
      expect(result.progress).toBe(33); // 1/3 = 33%
      expect(result.skippedPages).toEqual([]);
      expect(result.hiddenPages).toEqual([]);
    });

    it('should handle empty workflow', async () => {
      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue([]);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue([]);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue([]);

      const result = await service.evaluateNavigation('wf1', 'run1', null);

      expect(result.visiblePages).toEqual([]);
      expect(result.currentPageIndex).toBe(0);
      expect(result.nextPageId).toBe(null);
      expect(result.previousPageId).toBe(null);
      expect(result.progress).toBe(0);
    });

    it('should calculate correct current page index', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        { id: 'page2', workflowId: 'wf1', title: 'Page 2', order: 1, visibleIf: null, skipIf: null },
        { id: 'page3', workflowId: 'wf1', title: 'Page 3', order: 2, visibleIf: null, skipIf: null },
      ];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue([]);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue([]);

      const result = await service.evaluateNavigation('wf1', 'run1', 'page2');

      expect(result.currentPageIndex).toBe(1);
      expect(result.nextPageId).toBe('page3');
      expect(result.previousPageId).toBe('page1');
      expect(result.progress).toBe(67); // 2/3 = 67%
    });
  });

  // ========================================================================
  // VISIBLEIF CONDITIONS
  // ========================================================================

  describe('visibleIf conditions', () => {
    it('should hide pages when visibleIf is false', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        {
          id: 'page2',
          workflowId: 'wf1',
          title: 'Page 2',
          order: 1,
          visibleIf: { op: 'equals', left: { type: 'variable', path: 'showPage2' }, right: { type: 'value', value: true } },
          skipIf: null,
        },
        { id: 'page3', workflowId: 'wf1', title: 'Page 3', order: 2, visibleIf: null, skipIf: null },
      ];

      const mockSteps = [
        { id: 'step1', sectionId: 'page1', alias: 'showPage2' },
      ];

      const mockValues = [
        { runId: 'run1', stepId: 'step1', value: false }, // showPage2 = false
      ];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue(mockSteps as any);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue(mockValues as any);

      const result = await service.evaluateNavigation('wf1', 'run1', null);

      expect(result.visiblePages).toEqual(['page1', 'page3']); // page2 hidden
      expect(result.hiddenPages).toEqual(['page2']);
      expect(result.nextPageId).toBe('page3'); // Skips directly to page3
    });

    it('should show pages when visibleIf is true', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        {
          id: 'page2',
          workflowId: 'wf1',
          title: 'Page 2',
          order: 1,
          visibleIf: { op: 'equals', left: { type: 'variable', path: 'showPage2' }, right: { type: 'value', value: true } },
          skipIf: null,
        },
        { id: 'page3', workflowId: 'wf1', title: 'Page 3', order: 2, visibleIf: null, skipIf: null },
      ];

      const mockSteps = [
        { id: 'step1', sectionId: 'page1', alias: 'showPage2' },
      ];

      const mockValues = [
        { runId: 'run1', stepId: 'step1', value: true }, // showPage2 = true
      ];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue(mockSteps as any);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue(mockValues as any);

      const result = await service.evaluateNavigation('wf1', 'run1', null);

      expect(result.visiblePages).toEqual(['page1', 'page2', 'page3']); // All visible
      expect(result.hiddenPages).toEqual([]);
    });

    it('should handle complex visibleIf conditions', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        {
          id: 'page2',
          workflowId: 'wf1',
          title: 'Page 2',
          order: 1,
          visibleIf: {
            and: [
              { op: 'equals', left: { type: 'variable', path: 'employed' }, right: { type: 'value', value: true } },
              { op: 'gte', left: { type: 'variable', path: 'age' }, right: { type: 'value', value: 18 } },
            ],
          },
          skipIf: null,
        },
      ];

      const mockSteps = [
        { id: 'step1', sectionId: 'page1', alias: 'employed' },
        { id: 'step2', sectionId: 'page1', alias: 'age' },
      ];

      const mockValues = [
        { runId: 'run1', stepId: 'step1', value: true },
        { runId: 'run1', stepId: 'step2', value: 25 },
      ];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue(mockSteps as any);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue(mockValues as any);

      const result = await service.evaluateNavigation('wf1', 'run1', null);

      expect(result.visiblePages).toEqual(['page1', 'page2']); // Both conditions met
    });
  });

  // ========================================================================
  // SKIPIF CONDITIONS
  // ========================================================================

  describe('skipIf conditions', () => {
    it('should skip pages when skipIf is true', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        {
          id: 'page2',
          workflowId: 'wf1',
          title: 'Page 2',
          order: 1,
          visibleIf: null,
          skipIf: { op: 'equals', left: { type: 'variable', path: 'skipEmployment' }, right: { type: 'value', value: true } },
        },
        { id: 'page3', workflowId: 'wf1', title: 'Page 3', order: 2, visibleIf: null, skipIf: null },
      ];

      const mockSteps = [
        { id: 'step1', sectionId: 'page1', alias: 'skipEmployment' },
      ];

      const mockValues = [
        { runId: 'run1', stepId: 'step1', value: true }, // skipEmployment = true
      ];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue(mockSteps as any);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue(mockValues as any);

      const result = await service.evaluateNavigation('wf1', 'run1', null);

      expect(result.visiblePages).toEqual(['page1', 'page3']); // page2 skipped
      expect(result.skippedPages).toEqual(['page2']);
      expect(result.nextPageId).toBe('page3'); // Jumps from page1 to page3
    });

    it('should not skip pages when skipIf is false', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        {
          id: 'page2',
          workflowId: 'wf1',
          title: 'Page 2',
          order: 1,
          visibleIf: null,
          skipIf: { op: 'equals', left: { type: 'variable', path: 'skipEmployment' }, right: { type: 'value', value: true } },
        },
        { id: 'page3', workflowId: 'wf1', title: 'Page 3', order: 2, visibleIf: null, skipIf: null },
      ];

      const mockSteps = [
        { id: 'step1', sectionId: 'page1', alias: 'skipEmployment' },
      ];

      const mockValues = [
        { runId: 'run1', stepId: 'step1', value: false }, // skipEmployment = false
      ];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue(mockSteps as any);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue(mockValues as any);

      const result = await service.evaluateNavigation('wf1', 'run1', null);

      expect(result.visiblePages).toEqual(['page1', 'page2', 'page3']); // All visible
      expect(result.skippedPages).toEqual([]);
    });
  });

  // ========================================================================
  // COMBINED VISIBLEIF AND SKIPIF
  // ========================================================================

  describe('Combined visibleIf and skipIf', () => {
    it('should apply visibleIf before skipIf', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        {
          id: 'page2',
          workflowId: 'wf1',
          title: 'Page 2',
          order: 1,
          visibleIf: { op: 'equals', left: { type: 'variable', path: 'show' }, right: { type: 'value', value: true } },
          skipIf: { op: 'equals', left: { type: 'variable', path: 'skip' }, right: { type: 'value', value: true } },
        },
      ];

      const mockSteps = [
        { id: 'step1', sectionId: 'page1', alias: 'show' },
        { id: 'step2', sectionId: 'page1', alias: 'skip' },
      ];

      // Case 1: Hidden (visibleIf = false), so skipIf doesn't matter
      const mockValues1 = [
        { runId: 'run1', stepId: 'step1', value: false }, // show = false
        { runId: 'run1', stepId: 'step2', value: true },  // skip = true
      ];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue(mockSteps as any);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue(mockValues1 as any);

      const result1 = await service.evaluateNavigation('wf1', 'run1', null);

      expect(result1.visiblePages).toEqual(['page1']); // page2 hidden (not in visiblePages)
      expect(result1.hiddenPages).toEqual(['page2']);
      expect(result1.skippedPages).toEqual([]); // Can't skip what's already hidden

      // Case 2: Visible but skipped
      const mockValues2 = [
        { runId: 'run1', stepId: 'step1', value: true },  // show = true
        { runId: 'run1', stepId: 'step2', value: true },  // skip = true
      ];

      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue(mockValues2 as any);

      const result2 = await service.evaluateNavigation('wf1', 'run1', null);

      expect(result2.visiblePages).toEqual(['page1']); // page2 visible but skipped
      expect(result2.hiddenPages).toEqual([]);
      expect(result2.skippedPages).toEqual(['page2']);
    });
  });

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  describe('Helper methods', () => {
    it('should get first page', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        { id: 'page2', workflowId: 'wf1', title: 'Page 2', order: 1, visibleIf: null, skipIf: null },
      ];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue([]);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue([]);

      const firstPage = await service.getFirstPage('wf1', 'run1');

      expect(firstPage).toBe('page1');
    });

    it('should return null for first page if all pages hidden', async () => {
      const mockPages = [
        {
          id: 'page1',
          workflowId: 'wf1',
          title: 'Page 1',
          order: 0,
          visibleIf: { op: 'equals', left: { type: 'variable', path: 'show' }, right: { type: 'value', value: true } },
          skipIf: null,
        },
      ];

      const mockSteps = [{ id: 'step1', sectionId: 'page1', alias: 'show' }];
      const mockValues = [{ runId: 'run1', stepId: 'step1', value: false }];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue(mockSteps as any);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue(mockValues as any);

      const firstPage = await service.getFirstPage('wf1', 'run1');

      expect(firstPage).toBe(null);
    });

    it('should validate page navigability', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        {
          id: 'page2',
          workflowId: 'wf1',
          title: 'Page 2',
          order: 1,
          visibleIf: { op: 'equals', left: { type: 'variable', path: 'show' }, right: { type: 'value', value: true } },
          skipIf: null,
        },
      ];

      const mockSteps = [{ id: 'step1', sectionId: 'page1', alias: 'show' }];
      const mockValues = [{ runId: 'run1', stepId: 'step1', value: false }];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue(mockSteps as any);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue(mockValues as any);

      const isPage1Navigable = await service.isPageNavigable('wf1', 'run1', 'page1');
      const isPage2Navigable = await service.isPageNavigable('wf1', 'run1', 'page2');

      expect(isPage1Navigable).toBe(true);
      expect(isPage2Navigable).toBe(false); // Hidden
    });

    it('should get page sequence', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        {
          id: 'page2',
          workflowId: 'wf1',
          title: 'Page 2',
          order: 1,
          visibleIf: null,
          skipIf: { op: 'equals', left: { type: 'variable', path: 'skip' }, right: { type: 'value', value: true } },
        },
        { id: 'page3', workflowId: 'wf1', title: 'Page 3', order: 2, visibleIf: null, skipIf: null },
      ];

      const mockSteps = [{ id: 'step1', sectionId: 'page1', alias: 'skip' }];
      const mockValues = [{ runId: 'run1', stepId: 'step1', value: true }];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue(mockSteps as any);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue(mockValues as any);

      const sequence = await service.getPageSequence('wf1', 'run1');

      expect(sequence).toEqual(['page1', 'page3']); // page2 skipped
    });
  });

  // ========================================================================
  // ERROR HANDLING
  // ========================================================================

  describe('Error handling', () => {
    it('should default to visible on visibleIf evaluation error', async () => {
      const mockPages = [
        {
          id: 'page1',
          workflowId: 'wf1',
          title: 'Page 1',
          order: 0,
          visibleIf: { op: 'invalid', left: null, right: null }, // Invalid condition
          skipIf: null,
        },
      ];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue([]);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue([]);

      const result = await service.evaluateNavigation('wf1', 'run1', null);

      // Should default to visible (fail-safe)
      expect(result.visiblePages).toEqual(['page1']);
      expect(result.hiddenPages).toEqual([]);
    });

    it('should default to not skipping on skipIf evaluation error', async () => {
      const mockPages = [
        {
          id: 'page1',
          workflowId: 'wf1',
          title: 'Page 1',
          order: 0,
          visibleIf: null,
          skipIf: { op: 'invalid', left: null, right: null }, // Invalid condition
        },
      ];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue([]);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue([]);

      const result = await service.evaluateNavigation('wf1', 'run1', null);

      // Should default to not skipping (fail-safe)
      expect(result.visiblePages).toEqual(['page1']);
      expect(result.skippedPages).toEqual([]);
    });
  });

  // ========================================================================
  // PROGRESS CALCULATION
  // ========================================================================

  describe('Progress calculation', () => {
    it('should calculate correct progress for multi-page workflow', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        { id: 'page2', workflowId: 'wf1', title: 'Page 2', order: 1, visibleIf: null, skipIf: null },
        { id: 'page3', workflowId: 'wf1', title: 'Page 3', order: 2, visibleIf: null, skipIf: null },
        { id: 'page4', workflowId: 'wf1', title: 'Page 4', order: 3, visibleIf: null, skipIf: null },
      ];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue([]);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue([]);

      // Page 1: 1/4 = 25%
      const result1 = await service.evaluateNavigation('wf1', 'run1', 'page1');
      expect(result1.progress).toBe(25);

      // Page 2: 2/4 = 50%
      const result2 = await service.evaluateNavigation('wf1', 'run1', 'page2');
      expect(result2.progress).toBe(50);

      // Page 3: 3/4 = 75%
      const result3 = await service.evaluateNavigation('wf1', 'run1', 'page3');
      expect(result3.progress).toBe(75);

      // Page 4: 4/4 = 100%
      const result4 = await service.evaluateNavigation('wf1', 'run1', 'page4');
      expect(result4.progress).toBe(100);
    });

    it('should adjust progress when pages are skipped', async () => {
      const mockPages = [
        { id: 'page1', workflowId: 'wf1', title: 'Page 1', order: 0, visibleIf: null, skipIf: null },
        {
          id: 'page2',
          workflowId: 'wf1',
          title: 'Page 2',
          order: 1,
          visibleIf: null,
          skipIf: { op: 'equals', left: { type: 'variable', path: 'skip' }, right: { type: 'value', value: true } },
        },
        { id: 'page3', workflowId: 'wf1', title: 'Page 3', order: 2, visibleIf: null, skipIf: null },
      ];

      const mockSteps = [{ id: 'step1', sectionId: 'page1', alias: 'skip' }];
      const mockValues = [{ runId: 'run1', stepId: 'step1', value: true }];

      vi.mocked(repositories.sectionRepository.findByWorkflowId).mockResolvedValue(mockPages as any);
      vi.mocked(repositories.stepRepository.findByWorkflowId).mockResolvedValue(mockSteps as any);
      vi.mocked(repositories.stepValueRepository.findByRunId).mockResolvedValue(mockValues as any);

      // Only 2 navigable pages: page1, page3
      // Page 1: 1/2 = 50%
      const result1 = await service.evaluateNavigation('wf1', 'run1', 'page1');
      expect(result1.progress).toBe(50);

      // Page 3: 2/2 = 100%
      const result3 = await service.evaluateNavigation('wf1', 'run1', 'page3');
      expect(result3.progress).toBe(100);
    });
  });
});
