import { describe, it, expect } from 'vitest';
import { classifyRouteError } from '../../../server/utils/routeErrors';
import { ExportRowLimitError } from '../../../server/services/portability/bundleFormat';

describe('classifyRouteError', () => {
  it('should return 413 and preserve message for ExportRowLimitError', () => {
    const error = new ExportRowLimitError('Export exceeds the 1000 row limit');
    const result = classifyRouteError(error, 'Fallback message');
    
    expect(result.status).toBe(413);
    expect(result.message).toBe('Export exceeds the 1000 row limit');
  });

  it('should return 500 and fallback message for generic errors', () => {
    const error = new Error('Some internal crash');
    const result = classifyRouteError(error, 'Failed completely');
    
    expect(result.status).toBe(500);
    expect(result.message).toBe('Failed completely');
  });
});
