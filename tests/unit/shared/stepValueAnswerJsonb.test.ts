import { describe, expect, it } from 'vitest';

import { stepValues } from '../../../shared/schema';

// Both drivers hand the column an already-decoded jsonb value. drizzle's jsonb()
// JSON.parse()d it again, so an answer that is a string but also valid JSON came
// back as a different type (2026-09-15: a phone number read back as a number).
describe('step_values.value mapping', () => {
  const column = stepValues.value;

  it.each(['15552013344', '12345', 'true', 'null', '[1,2]'])('keeps the decoded string answer %s a string', (answer) => {
    expect(column.mapFromDriverValue(answer)).toBe(answer);
  });

  it('passes decoded objects, numbers and booleans through unchanged', () => {
    const obj = { street: '1 Main St' };
    expect(column.mapFromDriverValue(obj)).toBe(obj);
    expect(column.mapFromDriverValue(42)).toBe(42);
    expect(column.mapFromDriverValue(true)).toBe(true);
  });

  it('still writes JSON, so a string is stored as a jsonb string', () => {
    expect(column.mapToDriverValue('12345')).toBe('"12345"');
    expect(column.mapToDriverValue({ a: 1 })).toBe('{"a":1}');
  });
});
