import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StepValueRepository } from '../../../server/repositories/StepValueRepository';
import { RunPersistenceWriter } from '../../../server/services/runs/RunPersistenceWriter';

describe('StepValueRepository.upsertManyWithTimestamps', () => {
  let repo: StepValueRepository;

  beforeEach(() => {
    repo = new StepValueRepository();
  });

  it('inserts step values when no existing values conflict', async () => {
    const now = new Date('2026-08-05T12:00:00Z');
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              { id: '1', runId: 'run-1', stepId: 'step-1', value: 'hello', updatedAt: now },
            ]),
          }),
        }),
      }),
    };

    vi.spyOn(repo as unknown as Record<string, () => unknown>, 'getDb').mockReturnValue(mockDb as never);
    vi.spyOn(repo as unknown as Record<string, () => Promise<unknown>>, 'assertRunsMutable').mockResolvedValue(undefined as never);
    vi.spyOn(repo, 'findByRunId').mockResolvedValue([]);

    const result = await repo.upsertManyWithTimestamps(
      [
        { runId: 'run-1', stepId: 'step-1', value: 'hello', clientTimestamp: now.getTime() },
      ],
      mockDb as never
    );

    expect(result.conflicts).toEqual([]);
    expect(result.saved).toHaveLength(1);
    expect(result.saved[0].stepId).toBe('step-1');
  });

  it('detects conflict and skips overwrite when server value is newer than client timestamp', async () => {
    const serverDate = new Date('2026-08-05T12:30:00Z');
    const olderClientDate = new Date('2026-08-05T12:00:00Z');

    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    vi.spyOn(repo as unknown as Record<string, () => unknown>, 'getDb').mockReturnValue(mockDb as never);
    vi.spyOn(repo as unknown as Record<string, () => Promise<unknown>>, 'assertRunsMutable').mockResolvedValue(undefined as never);
    vi.spyOn(repo, 'findByRunId').mockResolvedValue([
      {
        id: 'val-1',
        runId: 'run-1',
        stepId: 'step-1',
        value: 'server-newer-value',
        createdAt: new Date('2026-08-05T11:00:00Z'),
        updatedAt: serverDate,
      } as never,
    ]);

    const result = await repo.upsertManyWithTimestamps(
      [
        { runId: 'run-1', stepId: 'step-1', value: 'stale-client-value', clientTimestamp: olderClientDate.getTime() },
      ],
      mockDb as never
    );

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toEqual({
      stepId: 'step-1',
      serverValue: 'server-newer-value',
      serverUpdatedAt: serverDate,
    });
    expect(result.saved).toEqual([]);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe('RunPersistenceWriter with conflict recovery', () => {
  it('returns conflicts from bulkSaveDraftValues', async () => {
    const mockValueRepo = {
      upsert: vi.fn(),
      upsertMany: vi.fn(),
      upsertManyWithTimestamps: vi.fn().mockResolvedValue({
        saved: [],
        conflicts: [
          {
            stepId: 'step-1',
            serverValue: 'latest-server-value',
            serverUpdatedAt: new Date('2026-08-05T12:00:00Z'),
          },
        ],
      }),
    };

    const mockDefinitionProvider = {
      getDefinition: vi.fn().mockResolvedValue({
        steps: [{ id: 'step-1', title: 'Step 1', type: 'text', required: false, config: {} }],
      }),
    };

    const mockRunRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'run-1', workflowId: 'wf-1', workflowVersionId: null }),
    };

    const writer = new RunPersistenceWriter(
      mockRunRepo as never,
      mockValueRepo as never,
      mockDefinitionProvider as never
    );

    const result = await writer.bulkSaveDraftValues(
      'run-1',
      [{ stepId: 'step-1', value: 'my-value', clientTimestamp: Date.now() - 10000 }],
      'wf-1'
    );

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].stepId).toBe('step-1');
    expect(result.conflicts[0].serverValue).toBe('latest-server-value');
  });
});
