import { describe, it, expect } from 'vitest';

import { isEligible, validateFiringPolicy, type EvaluationPoint } from '../../../../server/services/codeBlocks/firingPolicy';

/**
 * CB-3 AC 1, 2 and 8. The trigger table is a contract, so it is tested
 * literally and without a database — every rule is decidable from the config
 * plus the run's page progress, and keeping this pure means the table cannot
 * drift behind an integration fixture that happens to pass.
 */
const POINTS: EvaluationPoint[] = ['runStart', 'submit', 'runComplete'];

describe('firingPolicy.isEligible — AC 1: each trigger gates eligibility exactly as tabulated', () => {
  it('everySubmit is eligible at submit points only', () => {
    const eligible = POINTS.filter(point => isEligible({ trigger: 'everySubmit' }, point));
    expect(eligible).toEqual(['submit']);
  });

  it('runStart is eligible at run creation only', () => {
    const eligible = POINTS.filter(point => isEligible({ trigger: 'runStart' }, point));
    expect(eligible).toEqual(['runStart']);
  });

  it('runComplete is eligible in the completion pass only', () => {
    const eligible = POINTS.filter(point => isEligible({ trigger: 'runComplete' }, point));
    expect(eligible).toEqual(['runComplete']);
  });

  it('defaults to everySubmit when no trigger is stored (pre-CB-3 configs)', () => {
    // Configs written before CB-3 carry no trigger at all. They must keep
    // behaving as they always did rather than silently becoming ineligible,
    // which is why the field is optional and defaulted in one place.
    expect(isEligible({}, 'submit')).toBe(true);
    expect(isEligible({}, 'runStart')).toBe(false);
    expect(isEligible({}, 'runComplete')).toBe(false);
  });
});

describe('firingPolicy.isEligible — AC 2: atPage is a floor, not a fixed point', () => {
  const atPage = { trigger: 'atPage' as const, triggerPageId: 'page-3' };

  it('is not eligible before its page is reached', () => {
    expect(isEligible(atPage, 'submit', { currentPageId: 'page-1', visitedPageIds: ['page-1'] })).toBe(false);
  });

  it('becomes eligible on the submit of its own page', () => {
    expect(isEligible(atPage, 'submit', { currentPageId: 'page-3', visitedPageIds: ['page-1', 'page-2'] })).toBe(true);
  });

  it('REMAINS eligible at every later evaluation, which is what makes it a floor', () => {
    // The whole point of AC 2: a block unready when its page submitted must
    // fire at the next evaluation where it becomes ready, not never. A
    // fixed-point reading would return false here and strand the block.
    expect(isEligible(atPage, 'submit', {
      currentPageId: 'page-7',
      visitedPageIds: ['page-1', 'page-2', 'page-3', 'page-7'],
    })).toBe(true);
  });

  it('is never eligible at runStart or runComplete, even once its page is visited', () => {
    const progress = { currentPageId: 'page-9', visitedPageIds: ['page-3'] };
    expect(isEligible(atPage, 'runStart', progress)).toBe(false);
    expect(isEligible(atPage, 'runComplete', progress)).toBe(false);
  });

  it('is inert rather than always-eligible when triggerPageId is missing', () => {
    // Fail closed: a malformed config must not turn into "fires everywhere".
    expect(isEligible({ trigger: 'atPage' }, 'submit', { currentPageId: 'page-3' })).toBe(false);
  });
});

describe('firingPolicy.validateFiringPolicy — AC 8', () => {
  it('requires triggerPageId when trigger is atPage, naming the field', () => {
    expect(() => validateFiringPolicy({ trigger: 'atPage' }))
      .toThrow(/triggerPageId is required/);
  });

  it('rejects an empty triggerPageId as well as a missing one', () => {
    expect(() => validateFiringPolicy({ trigger: 'atPage', triggerPageId: '' }))
      .toThrow(/triggerPageId is required/);
  });

  it('rejects triggerPageId on every other trigger, naming the field', () => {
    for (const trigger of ['everySubmit', 'runStart', 'runComplete'] as const) {
      expect(() => validateFiringPolicy({ trigger, triggerPageId: 'page-3' }))
        .toThrow(/triggerPageId is only allowed/);
    }
  });

  it('accepts the valid shapes', () => {
    expect(() => validateFiringPolicy({ trigger: 'atPage', triggerPageId: 'page-3' })).not.toThrow();
    expect(() => validateFiringPolicy({ trigger: 'everySubmit' })).not.toThrow();
    expect(() => validateFiringPolicy({})).not.toThrow();
  });

  it('throws with the "Validation error" prefix the route error contract maps to 400', () => {
    // server/utils/routeErrors.ts classifies by message text; a different
    // phrasing here would surface as a 500 to the author saving the block.
    expect(() => validateFiringPolicy({ trigger: 'atPage' })).toThrow(/^Validation error:/);
  });
});
