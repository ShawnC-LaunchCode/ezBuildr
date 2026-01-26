/**
 * Tests for IterativeQualityImprover
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  IterativeQualityImprover,
  QualityImprovementConfig,
} from '../../server/services/ai/IterativeQualityImprover';
import { AIProviderClient } from '../../server/services/ai/AIProviderClient';
import { AIPromptBuilder } from '../../server/services/ai/AIPromptBuilder';

// Mock the dependencies
vi.mock('../../server/services/ai/AIProviderClient');
vi.mock('../../server/services/ai/AIPromptBuilder');
vi.mock('../../server/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('IterativeQualityImprover', () => {
  let mockClient: AIProviderClient;
  let mockPromptBuilder: AIPromptBuilder;
  let improver: IterativeQualityImprover;

  const createMockWorkflow = (score: number): any => ({
    title: 'Test Workflow',
    description: 'Test description',
    sections: [
      {
        id: 'section-1',
        title: 'Section 1',
        order: 0,
        steps: [
          {
            id: 'step-1',
            type: 'short_text' as const,
            title: 'First Name',
            alias: score >= 80 ? 'firstName' : 'field1', // Good alias if high score
            required: true,
            config: {},
          },
          {
            id: 'step-2',
            type: (score >= 80 ? 'email' : 'short_text') as const, // Correct type if high score
            title: 'Email Address',
            alias: score >= 80 ? 'emailAddress' : 'field2',
            required: true,
            config: {},
          },
        ],
      },
    ],
    logicRules: [],
    transformBlocks: [],
  });

  beforeEach(() => {
    mockClient = {
      callLLM: vi.fn(),
    } as unknown as AIProviderClient;

    mockPromptBuilder = new AIPromptBuilder();

    improver = new IterativeQualityImprover(mockClient, mockPromptBuilder);
  });

  describe('generateWithQualityLoop', () => {
    it('should return immediately if initial quality meets target', async () => {
      const workflow = createMockWorkflow(85);
      const initialScore = {
        overall: 85,
        breakdown: { aliases: 90, types: 85, structure: 80, ux: 85, completeness: 90, validation: 80 },
        issues: [],
        passed: true,
        suggestions: [],
      };

      const result = await improver.generateWithQualityLoop(
        workflow,
        { description: 'Test' },
        initialScore
      );

      expect(result.stoppedReason).toBe('target_reached');
      expect(result.totalIterations).toBe(0);
      expect(result.qualityImprovement).toBe(0);
      expect(mockClient.callLLM).not.toHaveBeenCalled();
    });

    it('should return immediately if initial quality is excellent', async () => {
      const workflow = createMockWorkflow(95);
      const initialScore = {
        overall: 96,
        breakdown: { aliases: 98, types: 95, structure: 95, ux: 95, completeness: 98, validation: 95 },
        issues: [],
        passed: true,
        suggestions: [],
      };

      const result = await improver.generateWithQualityLoop(
        workflow,
        { description: 'Test' },
        initialScore
      );

      // Should stop without iterating since score is already excellent
      expect(['excellent_quality', 'target_reached']).toContain(result.stoppedReason);
      expect(result.totalIterations).toBe(0);
    });

    it('should iterate to improve low-quality workflow', async () => {
      const lowQualityWorkflow = createMockWorkflow(60);
      const initialScore = {
        overall: 60,
        breakdown: { aliases: 40, types: 60, structure: 70, ux: 70, completeness: 80, validation: 60 },
        issues: [
          { type: 'error' as const, category: 'aliases' as const, message: 'Generic alias field1' },
          { type: 'warning' as const, category: 'types' as const, message: 'Should use email type' },
        ],
        passed: false,
        suggestions: ['Use descriptive aliases'],
      };

      // Mock AI returning improved workflow
      const improvedWorkflow = createMockWorkflow(85);
      (mockClient.callLLM as any).mockResolvedValue(JSON.stringify(improvedWorkflow));

      const result = await improver.generateWithQualityLoop(
        lowQualityWorkflow,
        { description: 'Test' },
        initialScore
      );

      expect(result.totalIterations).toBeGreaterThan(0);
      expect(mockClient.callLLM).toHaveBeenCalled();
    });

    it('should stop on diminishing returns', async () => {
      const workflow = createMockWorkflow(70);
      const initialScore = {
        overall: 70,
        breakdown: { aliases: 60, types: 70, structure: 75, ux: 75, completeness: 80, validation: 70 },
        issues: [{ type: 'warning' as const, category: 'aliases' as const, message: 'Could be better' }],
        passed: true,
        suggestions: [],
      };

      // Mock AI returning only slightly improved workflow each time
      const slightlyBetterWorkflow = createMockWorkflow(72);
      (mockClient.callLLM as any).mockResolvedValue(JSON.stringify(slightlyBetterWorkflow));

      const config: Partial<QualityImprovementConfig> = {
        targetQualityScore: 90,
        minImprovementThreshold: 5,
        maxIterations: 5,
      };

      const improverWithConfig = new IterativeQualityImprover(mockClient, mockPromptBuilder, config);
      const result = await improverWithConfig.generateWithQualityLoop(
        workflow,
        { description: 'Test' },
        initialScore
      );

      // Should stop due to diminishing returns (improvement < 5)
      expect(['diminishing_returns', 'no_improvement']).toContain(result.stoppedReason);
    });

    it('should stop at max iterations or earlier stopping condition', async () => {
      const workflow = createMockWorkflow(50);
      const initialScore = {
        overall: 50,
        breakdown: { aliases: 30, types: 50, structure: 60, ux: 60, completeness: 70, validation: 50 },
        issues: [
          { type: 'error' as const, category: 'aliases' as const, message: 'Bad aliases' },
          { type: 'error' as const, category: 'types' as const, message: 'Wrong types' },
        ],
        passed: false,
        suggestions: [],
      };

      // Mock AI returning same workflow (no real improvement since quality validator will score it the same)
      (mockClient.callLLM as any).mockImplementation(() => {
        return Promise.resolve(JSON.stringify(createMockWorkflow(50)));
      });

      const config: Partial<QualityImprovementConfig> = {
        targetQualityScore: 90,
        maxIterations: 2,
        minImprovementThreshold: 3,
      };

      const improverWithConfig = new IterativeQualityImprover(mockClient, mockPromptBuilder, config);
      const result = await improverWithConfig.generateWithQualityLoop(
        workflow,
        { description: 'Test' },
        initialScore
      );

      // Should stop due to max iterations, no improvement, or diminishing returns
      expect(['max_iterations', 'no_improvement', 'diminishing_returns']).toContain(result.stoppedReason);
      expect(result.totalIterations).toBeLessThanOrEqual(2);
    });

    it('should track costs across iterations', async () => {
      const workflow = createMockWorkflow(60);
      const initialScore = {
        overall: 60,
        breakdown: { aliases: 40, types: 60, structure: 70, ux: 70, completeness: 80, validation: 60 },
        issues: [{ type: 'error' as const, category: 'aliases' as const, message: 'Bad' }],
        passed: false,
        suggestions: [],
      };

      // Mock gradual improvement
      let callCount = 0;
      (mockClient.callLLM as any).mockImplementation(() => {
        callCount++;
        return Promise.resolve(JSON.stringify(createMockWorkflow(60 + callCount * 15)));
      });

      const config: Partial<QualityImprovementConfig> = {
        targetQualityScore: 85,
        maxIterations: 3,
        estimatedCostPerIterationCents: 10,
      };

      const improverWithConfig = new IterativeQualityImprover(mockClient, mockPromptBuilder, config);
      const result = await improverWithConfig.generateWithQualityLoop(
        workflow,
        { description: 'Test' },
        initialScore
      );

      // Cost should be tracked
      expect(result.totalEstimatedCostCents).toBeGreaterThan(0);
      expect(result.totalEstimatedCostCents).toBe(result.totalIterations * 10);
    });
  });

  describe('needsImprovement', () => {
    it('should return true for low scores', () => {
      const score = { overall: 65, breakdown: {} as any, issues: [], passed: false, suggestions: [] };
      expect(improver.needsImprovement(score)).toBe(true);
    });

    it('should return false for high scores', () => {
      const score = { overall: 85, breakdown: {} as any, issues: [], passed: true, suggestions: [] };
      expect(improver.needsImprovement(score)).toBe(false);
    });
  });

  describe('estimateImprovementValue', () => {
    it('should indicate not worth it if already at target', () => {
      const result = improver.estimateImprovementValue(85);
      expect(result.worthIt).toBe(false);
      expect(result.reason).toContain('Already at target');
    });

    it('should indicate worth it for low scores', () => {
      const result = improver.estimateImprovementValue(50);
      expect(result.worthIt).toBe(true);
      expect(result.reason).toContain('iterations');
    });
  });
});
