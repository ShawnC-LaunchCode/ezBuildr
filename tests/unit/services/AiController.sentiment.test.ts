import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiController } from '../../../server/controllers/AiController';
import { geminiService } from '../../../server/services/geminiService';

import type { AuthRequest } from '../../../server/middleware/auth';
import type { Response } from 'express';

describe('AiController.analyzeSentiment (AISL-8)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('threads the authenticated tenant through and supports the governed provider key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('AI_API_KEY', 'provider-key');
    const result = {
      sentiment: 'mixed' as const,
      confidence: 75,
      reasoning: 'Contains both positive and negative language.',
    };
    const analyzeSentiment = vi.spyOn(geminiService, 'analyzeSentiment').mockResolvedValue(result);
    const req = {
      body: { text: 'Mixed feelings' },
      tenantId: 'tenant-controller',
    } as AuthRequest;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { json, status } as unknown as Response;

    await AiController.analyzeSentiment(req, res);

    expect(analyzeSentiment).toHaveBeenCalledWith('Mixed feelings', 'tenant-controller');
    expect(json).toHaveBeenCalledWith({ success: true, ...result });
    expect(status).not.toHaveBeenCalled();
  });
});
