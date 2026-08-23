import { describe, it, expect, vi } from 'vitest';

import type { Block } from '@shared/schema';
import type { BranchConfig } from '@shared/types/blocks';

import type { blockService } from '../../../server/services/BlockService';
import { BlockRunner } from '../../../server/services/BlockRunner';
import type { transformBlockService } from '../../../server/services/TransformBlockService';

// RunExecutionCoordinator's diagnostics guard needs the id of whichever
// branch block set nextPageId (RUN2-21). This exercises BlockRunner.runPhase
// directly to prove it populates that id on the returned BlockResult.
describe('BlockRunner.runPhase - nextPageBlockId (RUN2-21)', () => {
  const branchConfig: BranchConfig = {
    branches: [
      { when: { key: 'age', op: 'greater_than', value: 18 }, gotoPageId: 'page-x' },
    ],
    fallbackPageId: 'page-fallback',
  };

  const makeBranchBlock = (id: string, order: number): Block => ({
    id,
    workflowId: 'wf-1',
    pageId: null,
    type: 'branch',
    phase: 'onNext',
    config: branchConfig,
    order,
    enabled: true,
    virtualStepId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    // Not every Block column matters for this test fixture.
  } as unknown as Block);

  it('populates nextPageBlockId with the id of the branch block that decided navigation (AC2)', async () => {
    const branchBlock = makeBranchBlock('branch-block-1', 0);
    const mockBlockSvc = {
      getBlocksForPhase: vi.fn().mockResolvedValue([branchBlock]),
    } as unknown as typeof blockService;
    const mockTransformSvc = {} as unknown as typeof transformBlockService;

    const runner = new BlockRunner(mockBlockSvc, mockTransformSvc);

    const result = await runner.runPhase({
      workflowId: 'wf-1',
      phase: 'onNext',
      data: { age: 21 },
    });

    expect(result.nextPageId).toBe('page-x');
    expect(result.nextPageBlockId).toBe('branch-block-1');
  });

  it('leaves nextPageBlockId undefined when no block sets a navigation decision', async () => {
    const mockBlockSvc = {
      getBlocksForPhase: vi.fn().mockResolvedValue([]),
    } as unknown as typeof blockService;
    const mockTransformSvc = {} as unknown as typeof transformBlockService;

    const runner = new BlockRunner(mockBlockSvc, mockTransformSvc);

    const result = await runner.runPhase({
      workflowId: 'wf-1',
      phase: 'onNext',
      data: {},
    });

    expect(result.nextPageId).toBeUndefined();
    expect(result.nextPageBlockId).toBeUndefined();
  });

  it('keeps the first matching branch block on a page with several branch blocks (first match wins)', async () => {
    const first = makeBranchBlock('branch-block-first', 0);
    const second = makeBranchBlock('branch-block-second', 1);
    const mockBlockSvc = {
      getBlocksForPhase: vi.fn().mockResolvedValue([first, second]),
    } as unknown as typeof blockService;
    const mockTransformSvc = {} as unknown as typeof transformBlockService;

    const runner = new BlockRunner(mockBlockSvc, mockTransformSvc);

    const result = await runner.runPhase({
      workflowId: 'wf-1',
      phase: 'onNext',
      data: { age: 21 },
    });

    expect(result.nextPageId).toBe('page-x');
    expect(result.nextPageBlockId).toBe('branch-block-first');
  });
});
