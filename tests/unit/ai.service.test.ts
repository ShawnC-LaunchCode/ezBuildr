/**
 * Unit tests for AIService
 *
 * These tests mock the OpenAI and Anthropic SDK calls to test the service logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIService } from '../../server/services/AIService';
import type { AIProviderConfig } from '../../shared/types/ai';

// Mock OpenAI and Anthropic SDKs
vi.mock('openai');
vi.mock('@anthropic-ai/sdk');

describe('AIService', () => {
  let openaiService: AIService;
  let anthropicService: AIService;

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
      // Mock the OpenAI response
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Test Workflow',
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
              }),
            },
          },
        ],
      };

      // @ts-ignore
      openaiService['openaiClient'] = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        },
      };

      const result = await openaiService.generateWorkflow({
        description: 'Create a form to collect personal information',
        projectId: 'test-project-id',
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Workflow');
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].steps).toHaveLength(2);
    });

    it('should validate unique section IDs', async () => {
      // Mock response with duplicate section IDs
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Test Workflow',
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
              }),
            },
          },
        ],
      };

      // @ts-ignore
      openaiService['openaiClient'] = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        },
      };

      await expect(
        openaiService.generateWorkflow({
          description: 'Test',
          projectId: 'test-project-id',
        })
      ).rejects.toThrow('Duplicate section IDs');
    });

    it('should validate unique step IDs', async () => {
      // Mock response with duplicate step IDs
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Test Workflow',
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
              }),
            },
          },
        ],
      };

      // @ts-ignore
      openaiService['openaiClient'] = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        },
      };

      await expect(
        openaiService.generateWorkflow({
          description: 'Test',
          projectId: 'test-project-id',
        })
      ).rejects.toThrow('Duplicate step ID');
    });

    it('should validate logic rules reference existing steps', async () => {
      // Mock response with logic rule referencing non-existent step
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Test Workflow',
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
              }),
            },
          },
        ],
      };

      // @ts-ignore
      openaiService['openaiClient'] = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        },
      };

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

      // @ts-ignore
      openaiService['openaiClient'] = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(rateLimitError),
          },
        },
      };

      try {
        await openaiService.generateWorkflow({
          description: 'Test',
          projectId: 'test-project-id',
        });
        expect.fail('Should have thrown rate limit error');
      } catch (error: any) {
        expect(error.code).toBe('RATE_LIMIT');
      }
    });

    it('should handle JSON parsing errors', async () => {
      // Mock response with invalid JSON
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'This is not valid JSON',
            },
          },
        ],
      };

      // @ts-ignore
      openaiService['openaiClient'] = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        },
      };

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
      // Mock the Anthropic response
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              name: 'Test Workflow',
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
            }),
          },
        ],
      };

      // @ts-ignore
      anthropicService['anthropicClient'] = {
        messages: {
          create: vi.fn().mockResolvedValue(mockResponse),
        },
      };

      const result = await anthropicService.generateWorkflow({
        description: 'Create a form to collect personal information',
        projectId: 'test-project-id',
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Workflow');
      expect(result.sections).toHaveLength(1);
    });

    it('should strip markdown code blocks from Anthropic responses', async () => {
      // Mock response with markdown code blocks
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '```json\n' + JSON.stringify({
              name: 'Test Workflow',
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
            }) + '\n```',
          },
        ],
      };

      // @ts-ignore
      anthropicService['anthropicClient'] = {
        messages: {
          create: vi.fn().mockResolvedValue(mockResponse),
        },
      };

      const result = await anthropicService.generateWorkflow({
        description: 'Test',
        projectId: 'test-project-id',
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Workflow');
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
        choices: [
          {
            message: {
              content: JSON.stringify({
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
              }),
            },
          },
        ],
      };

      // @ts-ignore
      openaiService['openaiClient'] = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        },
      };

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
