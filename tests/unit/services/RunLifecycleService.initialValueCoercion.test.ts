/**
 * RUN2-20: URL prefill silently changes a value's type.
 *
 * `parseInitialValuesFromUrl` (client/src/hooks/runner/useRunSession.ts) runs
 * every query parameter through `JSON.parse`, so the same question receives
 * different value *types* depending on what the digits look like
 * (`?ref=12345` -> number 12345, `?zip=01234` -> string "01234"). The fix
 * lives server-side in `RunLifecycleService.populateInitialValues`, where
 * `step.type` is known: coerce prefilled values against the step's
 * normalized runner type instead of trusting whatever JSON.parse produced.
 *
 * This test drives `populateInitialValues` directly with constructor-injected
 * mocks (no DB) and asserts what gets handed to `bulkSaveValues`.
 */
import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';

import type { Step, Page } from '@shared/schema';

import { stepRepository, pageRepository, stepValueRepository } from '../../../server/repositories';
import type { LogicService } from '../../../server/services/LogicService';
import type { RunDataService } from '../../../server/services/workflow-runs/RunDataService';
import { RunLifecycleService } from '../../../server/services/workflow-runs/RunLifecycleService';
import type { RunPersistenceWriter } from '../../../server/services/runs/RunPersistenceWriter';

// RunLifecycleService.ts pulls in a wide transitive graph (blockRunner ->
// every block runner -> their own repositories, LogicService,
// unrelated services via real singleton imports, all of which
// resolve this same "../../repositories" module. Keep every real export
// (via importOriginal) and only override the two repos this test drives
// directly through constructor injection.
vi.mock('../../../server/repositories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/repositories')>();
  return {
    ...actual,
    stepRepository: {
      findByPageIds: vi.fn(),
    },
    pageRepository: {
      findByWorkflowId: vi.fn(),
    },
  };
});

vi.mock('../../../server/services/runs/RunPersistenceWriter', () => {
  const mockPersistence = {
    bulkSaveValues: vi.fn().mockResolvedValue(undefined),
  };
  // Must be a real constructor (not an arrow function): the module's own
  // `export const runLifecycleService = new RunLifecycleService()` singleton
  // runs `new RunPersistenceWriter()` as a default param at import time.
  function MockRunPersistenceWriter() {
    return mockPersistence;
  }
  return {
    RunPersistenceWriter: vi.fn(MockRunPersistenceWriter),
    runPersistenceWriter: mockPersistence,
  };
});

function makePage(id: string): Page {
  return { id } as unknown as Page;
}

function makeStep(overrides: Partial<Step>): Step {
  return {
    id: overrides.id ?? 'step-id',
    alias: overrides.alias ?? null,
    type: overrides.type ?? 'short_text',
    pageId: 'page-1',
    isVirtual: false,
    defaultValue: null,
    ...overrides,
  } as unknown as Step;
}

describe('RUN2-20: RunLifecycleService.populateInitialValues type coercion', () => {
  let service: RunLifecycleService;
  let mockStepRepo: Mocked<typeof stepRepository>;
  let mockPageRepo: Mocked<typeof pageRepository>;
  let mockPersistence: Mocked<RunPersistenceWriter>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockStepRepo = stepRepository as unknown as Mocked<typeof stepRepository>;
    mockPageRepo = pageRepository as unknown as Mocked<typeof pageRepository>;

    const persistenceModule = await import('../../../server/services/runs/RunPersistenceWriter');
    mockPersistence = (persistenceModule as unknown as { runPersistenceWriter: Mocked<RunPersistenceWriter> }).runPersistenceWriter;

    mockPageRepo.findByWorkflowId.mockResolvedValue([makePage('page-1')]);

    service = new RunLifecycleService(
      stepValueRepository as unknown as typeof stepValueRepository,
      mockStepRepo,
      mockPageRepo,
      mockPersistence,
      {} as unknown as LogicService,
      {} as unknown as RunDataService,
    );
  });

  async function runWithStep(step: Step, initialValues: Record<string, unknown>) {
    mockStepRepo.findByPageIds.mockResolvedValue([step]);
    await service.populateInitialValues('run-1', 'workflow-1', { initialValues });
    const calls = mockPersistence.bulkSaveValues.mock.calls;
    return calls[calls.length - 1]?.[1] as Array<{ stepId: string; value: unknown }> | undefined;
  }

  it('AC1: a numeric-looking string prefilled onto a short_text step stays a string', async () => {
    const step = makeStep({ id: 'step-ref', alias: 'ref', type: 'short_text' });
    const saved = await runWithStep(step, { ref: 12345 }); // JSON.parse("12345") -> number 12345

    expect(saved).toEqual([{ stepId: 'step-ref', value: '12345' }]);
    expect(typeof saved?.[0]?.value).toBe('string');
  });

  it('AC1b: short_text_advanced spelling is normalized and also coerced to a string', async () => {
    const step = makeStep({ id: 'step-ref2', alias: 'ref2', type: 'text' });
    const saved = await runWithStep(step, { ref2: 12345 });
    expect(saved).toEqual([{ stepId: 'step-ref2', value: '12345' }]);
  });

  it('AC2: a numeric string prefilled onto a number step becomes a number', async () => {
    const step = makeStep({ id: 'step-n', alias: 'n', type: 'number' });
    const saved = await runWithStep(step, { n: 42 }); // JSON.parse("42") -> number 42 already

    expect(saved).toEqual([{ stepId: 'step-n', value: 42 }]);
    expect(typeof saved?.[0]?.value).toBe('number');
  });

  it('AC2b: a non-numeric string prefilled onto a number step is left as the raw string, never NaN', async () => {
    const step = makeStep({ id: 'step-n2', alias: 'n2', type: 'number' });
    const saved = await runWithStep(step, { n2: 'abc' }); // JSON.parse("abc") throws -> raw string "abc"

    expect(saved).toEqual([{ stepId: 'step-n2', value: 'abc' }]);
    expect(saved?.[0]?.value).not.toBeNaN();
  });

  it('AC2c: a numeric string with a leading zero on a number step is coerced to a number (JSON.parse would have kept it a string)', async () => {
    const step = makeStep({ id: 'step-zip', alias: 'zip', type: 'number' });
    const saved = await runWithStep(step, { zip: '01234' }); // JSON.parse("01234") throws -> raw string "01234"

    expect(saved).toEqual([{ stepId: 'step-zip', value: 1234 }]);
  });

  it('AC3: the string "true" prefilled onto a boolean step becomes boolean true', async () => {
    const step = makeStep({ id: 'step-flag', alias: 'flag', type: 'boolean' });
    const saved = await runWithStep(step, { flag: true }); // JSON.parse("true") -> boolean true already

    expect(saved).toEqual([{ stepId: 'step-flag', value: true }]);
    expect(typeof saved?.[0]?.value).toBe('boolean');
  });

  it('STB-6: a logical Boolean default is coerced to the configured storage alias', async () => {
    const step = makeStep({
      id: 'step-consent',
      alias: 'consent',
      type: 'boolean',
      defaultValue: true,
      config: {
        storeAsBoolean: false,
        trueAlias: 'consent_given',
        falseAlias: 'consent_withheld',
      },
    });
    const saved = await runWithStep(step, {});

    expect(saved).toEqual([{ stepId: 'step-consent', value: 'consent_given' }]);
  });

  it('AC4: an array prefilled onto a choice step is left untouched', async () => {
    const step = makeStep({ id: 'step-picks', alias: 'picks', type: 'choice' });
    const saved = await runWithStep(step, { picks: ['a', 'b'] });

    expect(saved).toEqual([{ stepId: 'step-picks', value: ['a', 'b'] }]);
  });

  it('AC5: currency and scale (numeric-family types) are also coerced via adaptLegacyStep', async () => {
    const currencyStep = makeStep({ id: 'step-price', alias: 'price', type: 'currency' });
    const savedCurrency = await runWithStep(currencyStep, { price: '19.99' });
    expect(savedCurrency).toEqual([{ stepId: 'step-price', value: 19.99 }]);

    const scaleStep = makeStep({ id: 'step-rating', alias: 'rating', type: 'scale_advanced' });
    const savedScale = await runWithStep(scaleStep, { rating: '5' });
    expect(savedScale).toEqual([{ stepId: 'step-rating', value: 5 }]);
  });
});
