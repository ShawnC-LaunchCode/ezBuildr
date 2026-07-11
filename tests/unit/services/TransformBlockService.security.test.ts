import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransformBlockService } from '../../../server/services/TransformBlockService';
import { scriptEngine } from '../../../server/services/scripting/ScriptEngine';

vi.mock('../../../server/services/scripting/ScriptEngine', () => ({
  scriptEngine: {
    validate: vi.fn(),
  }
}));

vi.mock('../../../server/repositories', () => ({
  transformBlockRepository: { create: vi.fn(), update: vi.fn(), findById: vi.fn() },
  transformBlockRunRepository: {},
  workflowRepository: {},
  stepValueRepository: {},
  sectionRepository: { findByWorkflowId: vi.fn() },
  stepRepository: { create: vi.fn(), update: vi.fn() },
}));

vi.mock('../../../server/services/WorkflowService', () => ({
  workflowService: { verifyAccess: vi.fn() }
}));

describe('TransformBlockService Security (AST Validation)', () => {
  let service: TransformBlockService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TransformBlockService();
  });

  it('should reject createBlock if AST validation fails', async () => {
    vi.mocked(scriptEngine.validate).mockResolvedValue({ valid: false, error: 'Forbidden construct: process.exit' });

    await expect(service.createBlock('wf-123', 'user-1', {
      name: 'Malicious block',
      type: 'script',
      language: 'javascript',
      code: 'process.exit(1);',
      outputKey: 'res',
      order: 1
    } as any)).rejects.toThrow('Script validation failed: Forbidden construct: process.exit');

    expect(scriptEngine.validate).toHaveBeenCalledWith({ language: 'javascript', code: 'process.exit(1);' });
  });

  it('should reject updateBlock if AST validation fails', async () => {
    const { transformBlockRepository } = await import('../../../server/repositories');
    vi.mocked(transformBlockRepository.findById).mockResolvedValue({ id: 'block-123', workflowId: 'wf-123', language: 'javascript' } as any);
    
    vi.mocked(scriptEngine.validate).mockResolvedValue({ valid: false, error: 'Forbidden construct: require' });

    await expect(service.updateBlock('block-123', 'user-1', {
      code: 'const fs = require("fs");'
    })).rejects.toThrow('Script validation failed: Forbidden construct: require');

    expect(scriptEngine.validate).toHaveBeenCalledWith({ language: 'javascript', code: 'const fs = require("fs");' });
  });
});
