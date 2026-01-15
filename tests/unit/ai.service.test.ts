/**
 * Unit tests for AIService
 *
 * These tests mock the IAIProvider interface to test the service logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AIService } from '../../server/services/AIService';

import type { AIProviderConfig } from '../../shared/types/ai';

// Mock OpenAI and Anthropic SDKs (not strictly needed if we mock provider, but keeps imports happy)
vi.mock('openai');
vi.mock('@anthropic-ai/sdk');

describe('AIService', () => {
  let openaiService: AIService;
  let anthropicService: AIService;

  const createMockProvider = (providerName: string, responseText?: string, error?: any) => {
    return {
      providerName,
      generateResponse: error ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue(responseText || '{}'),
      estimateTokenCount: vi.fn().mockReturnValue(100),
      estimateCost: vi.fn().mockReturnValue(0.01),
      getMaxContextTokens: vi.fn().mockReturnValue(8000),
      isResponseTruncated: vi.fn().mockReturnValue(false),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('OpenAI Provider', () => {
    beforeEach(() => {
      const config: AIProviderConfig = {
        provider: 'openai',
        apiKey: 'test-api-key',
        model: 'gpt-4-turbo-preview',
      };
      openaiService = new AIService(config);
    });

    it('should initialize with OpenAI configuration', () => {
      expect(openaiService).toBeDefined();
    });

    it('should generate a valid workflow from description', async () => {
      const mockWorkflow = {
        title: 'Test Workflow',
        description: 'A test workflow',
        sections: [
          {
            id: 'section_1',
            title: 'Personal Information',
            order: 0,
            steps: [
              {
                id: 'step_1',
                type: 'short_text',
                title: 'First Name',
                alias: 'firstName',
                required: true,
              },
              {
                id: 'step_2',
                type: 'short_text',
                title: 'Last Name',
                alias: 'lastName',
                required: true,
              },
            ],
          },
        ],
        logicRules: [],
        transformBlocks: [],
      };

      // Mock the provider
      const mockProvider = createMockProvider('openai', JSON.stringify(mockWorkflow));
      (openaiService as any).provider = mockProvider;

      const result = await openaiService.generateWorkflow({
        description: 'Create a form to collect personal information',
        projectId: 'test-project-id',
      });

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Workflow');
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].steps).toHaveLength(2);
    });

    it('should validate unique section IDs', async () => {
      const mockWorkflow = {
        title: 'Test Workflow',
        sections: [
          {
            id: 'section_1',
            title: 'Section 1',
            order: 0,
            steps: [],
          },
          {
            id: 'section_1', // Duplicate ID
            title: 'Section 2',
            order: 1,
            steps: [],
          },
        ],
        logicRules: [],
        transformBlocks: [],
      };

      const mockProvider = createMockProvider('openai', JSON.stringify(mockWorkflow));
      (openaiService as any).provider = mockProvider;

      await expect(
        openaiService.generateWorkflow({
          description: 'Test',
          projectId: 'test-project-id',
        })
      ).rejects.toThrow('Duplicate section IDs');
    });

    it('should validate unique step IDs', async () => {
      const mockWorkflow = {
        title: 'Test Workflow',
        sections: [
          {
            id: 'section_1',
            title: 'Section 1',
            order: 0,
            steps: [
              {
                id: 'step_1',
                type: 'short_text',
                title: 'Step 1',
                alias: 'step1',
              },
              {
                id: 'step_1', // Duplicate ID
                type: 'short_text',
                title: 'Step 2',
                alias: 'step2',
              },
            ],
          },
        ],
        logicRules: [],
        transformBlocks: [],
      };

      const mockProvider = createMockProvider('openai', JSON.stringify(mockWorkflow));
      (openaiService as any).provider = mockProvider;

      await expect(
        openaiService.generateWorkflow({
          description: 'Test',
          projectId: 'test-project-id',
        })
      ).rejects.toThrow('Duplicate step ID');
    });

    it('should validate logic rules reference existing steps', async () => {
      const mockWorkflow = {
        title: 'Test Workflow',
        sections: [
          {
            id: 'section_1',
            title: 'Section 1',
            order: 0,
            steps: [
              {
                id: 'step_1',
                type: 'short_text',
                title: 'Step 1',
                alias: 'step1',
              },
            ],
          },
        ],
        logicRules: [
          {
            id: 'rule_1',
            conditionStepAlias: 'nonexistent', // Non-existent step
            operator: 'equals',
            conditionValue: 'yes',
            targetType: 'step',
            targetAlias: 'step1',
            action: 'show',
          },
        ],
        transformBlocks: [],
      };

      const mockProvider = createMockProvider('openai', JSON.stringify(mockWorkflow));
      (openaiService as any).provider = mockProvider;

      await expect(
        openaiService.generateWorkflow({
          description: 'Test',
          projectId: 'test-project-id',
        })
      ).rejects.toThrow('references non-existent step alias');
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      // @ts-ignore
      rateLimitError.status = 429;
      // @ts-ignore
      rateLimitError.code = 'rate_limit_exceeded';

      // Mock provider throwing error
      const mockProvider = createMockProvider('openai', undefined, rateLimitError);
      (openaiService as any).provider = mockProvider;

      // Use manual mock for setTimeout to avoid fake timer issues and race conditions
      const originalSetTimeout = global.setTimeout;
      // @ts-ignore
      global.setTimeout = vi.fn((cb) => cb());

      try {
        await openaiService.generateWorkflow({
          description: 'Test',
          projectId: 'test-project-id',
        });
        expect.fail('Should have thrown rate limit error');
      } catch (error: any) {
        // The service wraps/re-throws rate limit errors
        expect(error.code).toBe('RATE_LIMIT');
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });

    it('should handle JSON parsing errors', async () => {
      const mockProvider = createMockProvider('openai', 'This is not valid JSON');
      (openaiService as any).provider = mockProvider;

      try {
        await openaiService.generateWorkflow({
          description: 'Test',
          projectId: 'test-project-id',
        });
        expect.fail('Should have thrown parsing error');
      } catch (error: any) {
        expect(error.code).toBe('INVALID_RESPONSE');
      }
    });
  });

  describe('Anthropic Provider', () => {
    beforeEach(() => {
      const config: AIProviderConfig = {
        provider: 'anthropic',
        apiKey: 'test-api-key',
        model: 'claude-3-5-sonnet-20241022',
      };
      anthropicService = new AIService(config);
    });

    it('should initialize with Anthropic configuration', () => {
      expect(anthropicService).toBeDefined();
    });

    it('should generate a valid workflow from description', async () => {
      const mockWorkflow = {
        title: 'Test Workflow',
        description: 'A test workflow',
        sections: [
          {
            id: 'section_1',
            title: 'Personal Information',
            order: 0,
            steps: [
              {
                id: 'step_1',
                type: 'short_text',
                title: 'First Name',
                alias: 'firstName',
                required: true,
              },
            ],
          },
        ],
        logicRules: [],
        transformBlocks: [],
      };

      const mockProvider = createMockProvider('anthropic', JSON.stringify(mockWorkflow));
      (anthropicService as any).provider = mockProvider;

      const result = await anthropicService.generateWorkflow({
        description: 'Create a form to collect personal information',
        projectId: 'test-project-id',
      });

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Workflow');
      expect(result.sections).toHaveLength(1);
    });

    it('should strip markdown code blocks from Anthropic responses', async () => {
      // Logic for stripping markdown is inside callLLM, so we just return markdown string from provider
      const mockWorkflow = {
        title: 'Test Workflow',
        sections: [
          {
            id: 'section_1',
            title: 'Test',
            order: 0,
            steps: [],
          },
        ],
        logicRules: [],
        transformBlocks: [],
      };

      const markdown = `\`\`\`json\n${JSON.stringify(mockWorkflow)}\n\`\`\``;

      const mockProvider = createMockProvider('anthropic', markdown);
      (anthropicService as any).provider = mockProvider;

      const result = await anthropicService.generateWorkflow({
        description: 'Test',
        projectId: 'test-project-id',
      });

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Workflow');
    });
  });

  describe('Template Binding Suggestions', () => {
    beforeEach(() => {
      const config: AIProviderConfig = {
        provider: 'openai',
        apiKey: 'test-api-key',
        model: 'gpt-4-turbo-preview',
      };
      openaiService = new AIService(config);
    });

    it('should generate binding suggestions', async () => {
      const mockResponse = {
        suggestions: [
          {
            placeholder: 'client_name',
            variable: 'clientName',
            confidence: 0.95,
            rationale: 'Direct semantic match',
          },
        ],
        unmatchedPlaceholders: [],
        unmatchedVariables: [],
      };

      const mockProvider = createMockProvider('openai', JSON.stringify(mockResponse));
      (openaiService as any).provider = mockProvider;

      const result = await openaiService.suggestTemplateBindings(
        {
          workflowId: 'test-workflow-id',
          placeholders: ['client_name'],
        },
        [
          { alias: 'clientName', label: 'Client Name', type: 'short_text' },
        ],
        ['client_name']
      );

      expect(result).toBeDefined();
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].confidence).toBeGreaterThan(0.9);
    });
  });
});
