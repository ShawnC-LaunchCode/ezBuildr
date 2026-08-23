import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransformBlockService } from '../../../server/services/TransformBlockService';
import type { TransformBlock } from '@shared/schema';

vi.mock('../../../server/repositories', () => ({
  transformBlockRepository: { findById: vi.fn(), delete: vi.fn() },
  transformBlockRunRepository: {},
  workflowRepository: {},
  stepValueRepository: {},
  pageRepository: {},
  stepRepository: { delete: vi.fn(), softDelete: vi.fn() },
}));

vi.mock('../../../server/services/WorkflowService', () => ({
  workflowService: { verifyAccess: vi.fn() },
}));

/**
 * ICW2-B11: TransformBlockService.deleteBlock used to hard-delete the
 * block's virtual step, destroying any respondent step_values recorded
 * against its computed output. It must soft-delete instead, matching the
 * ICW2-B1 pattern used by StepService/PageService.
 */
describe('TransformBlockService.deleteBlock (ICW2-B11 soft-delete)', () => {
  let service: TransformBlockService;

  const existingBlock = {
    id: 'block-123',
    workflowId: 'wf-123',
    pageId: null,
    name: 'Existing block',
    language: 'javascript',
    code: 'emit(null);',
    inputKeys: [],
    outputKey: 'res',
    virtualStepId: 'virtual-step-123',
    phase: 'onPageSubmit',
    enabled: true,
    order: 0,
    timeoutMs: 1000,
    createdAt: null,
    updatedAt: null,
  } satisfies TransformBlock;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new TransformBlockService();

    const { transformBlockRepository } = await import('../../../server/repositories');
    vi.mocked(transformBlockRepository.findById).mockResolvedValue(existingBlock);
  });

  it('soft-deletes the virtual step instead of hard-deleting it', async () => {
    const { stepRepository, transformBlockRepository } = await import('../../../server/repositories');

    await service.deleteBlock('block-123', 'user-1');

    expect(vi.mocked(stepRepository.softDelete)).toHaveBeenCalledWith('virtual-step-123');
    expect(vi.mocked(stepRepository.delete)).not.toHaveBeenCalled();
    expect(vi.mocked(transformBlockRepository.delete)).toHaveBeenCalledWith('block-123');
  });

  it('still removes the transform block definition even when the virtual step is already gone', async () => {
    const { stepRepository, transformBlockRepository } = await import('../../../server/repositories');
    vi.mocked(stepRepository.softDelete).mockRejectedValueOnce(new Error('Step not found'));

    await expect(service.deleteBlock('block-123', 'user-1')).resolves.toBeUndefined();

    expect(vi.mocked(transformBlockRepository.delete)).toHaveBeenCalledWith('block-123');
  });
});
