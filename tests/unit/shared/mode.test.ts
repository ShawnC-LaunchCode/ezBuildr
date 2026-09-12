import { describe, expect, it } from 'vitest';

import { resolveMode } from '../../../shared/mode';

describe('resolveMode', () => {
  it('uses the persisted user default when the workflow has no override', () => {
    expect(resolveMode(null, 'advanced')).toBe('advanced');
    expect(resolveMode(null, 'easy')).toBe('easy');
  });

  it('gives the persisted workflow override precedence over the user default', () => {
    expect(resolveMode('advanced', 'easy')).toBe('advanced');
    expect(resolveMode('easy', 'advanced')).toBe('easy');
  });
});
