import { describe, expect, it } from 'vitest';

import { collectionFields, datavaultValues, stepValues, steps } from '../../../shared/schema';

interface MappedColumn {
  mapFromDriverValue: (value: unknown) => unknown;
  mapToDriverValue: (value: unknown) => unknown;
}

// Both drivers hand these columns an already-decoded jsonb value. drizzle's jsonb()
// JSON.parse()d it again, so a string that is also valid JSON came back as another
// type (2026-09-15: a phone answer as a number, a DataVault text cell "12345" as 12345).
const columns: Array<[string, MappedColumn]> = [
  ['step_values.value', stepValues.value as unknown as MappedColumn],
  ['datavault_values.value', datavaultValues.value as unknown as MappedColumn],
  ['steps.default_value', steps.defaultValue as unknown as MappedColumn],
  ['collection_fields.default_value', collectionFields.defaultValue as unknown as MappedColumn],
];

describe.each(columns)('%s', (_name, column) => {
  it.each(['15552013344', '12345', 'true', 'null', '[1,2]'])('keeps the decoded string %s a string', (value) => {
    expect(column.mapFromDriverValue(value)).toBe(value);
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
