import { describe, it, expect } from 'vitest';

import {
    validateListValue,
    LIST_VALIDATION_MAX_DEPTH,
    LIST_VALIDATION_MAX_TOTAL_ITEMS,
} from '../../../../shared/validation/BlockValidation';

import type { ListConfig, ListField, ListItem, ListValue } from '../../../../shared/types/stepConfigs';

/**
 * LIST-3: shared/validation/BlockValidation.ts has no `list` case, so a
 * submitted list value is entirely unvalidated server-side — min/max item
 * counts, per-field `required` inside items, and depth/count DoS guards are
 * all unenforced. These tests cover acceptance criteria 1-7 for the new
 * `validateListValue` recursive validator.
 */
describe('validateListValue', () => {
    function questionField(overrides: Partial<Extract<ListField, { kind: 'question' }>> = {}): ListField {
        return {
            kind: 'question',
            id: overrides.id ?? 'f1',
            alias: overrides.alias ?? 'name',
            type: 'short_text',
            title: overrides.title ?? 'Name',
            order: overrides.order ?? 0,
            ...overrides,
        };
    }

    function listField(overrides: Partial<Extract<ListField, { kind: 'list' }>> & { list: ListConfig }): ListField {
        return {
            kind: 'list',
            id: overrides.id ?? 'nested',
            alias: overrides.alias ?? 'nested',
            title: overrides.title ?? 'Nested',
            order: overrides.order ?? 0,
            ...overrides,
        };
    }

    function item(values: Record<string, unknown>, itemId = 'item-1'): ListItem {
        return { itemId, values };
    }

    // ---- AC1: minItems / maxItems enforced at every level ----
    describe('item count constraints (AC1)', () => {
        it('rejects fewer than minItems at the top level', () => {
            const config: ListConfig = { fields: [questionField()], minItems: 2 };
            const value: ListValue = { items: [item({ name: 'Ava' })] };

            const errors = validateListValue(value, config, 'children');

            expect(errors['children']).toEqual(expect.arrayContaining([expect.stringContaining('At least 2')]));
        });

        it('rejects more than maxItems at the top level', () => {
            const config: ListConfig = { fields: [questionField()], maxItems: 1 };
            const value: ListValue = { items: [item({ name: 'Ava' }, 'a'), item({ name: 'Ben' }, 'b')] };

            const errors = validateListValue(value, config, 'children');

            expect(errors['children']).toEqual(expect.arrayContaining([expect.stringContaining('Maximum 1')]));
        });

        it('enforces minItems/maxItems on a nested list, not just the top', () => {
            const addressConfig: ListConfig = { fields: [questionField({ alias: 'street', title: 'Street' })], minItems: 1 };
            const childConfig: ListConfig = {
                fields: [questionField({ alias: 'name', title: 'Name' }), listField({ alias: 'addresses', list: addressConfig })],
            };
            const value: ListValue = {
                items: [item({ name: 'Ava', addresses: { items: [] } })],
            };

            const errors = validateListValue(value, childConfig, 'children');

            expect(errors['children[0].addresses']).toEqual(
                expect.arrayContaining([expect.stringContaining('At least 1')])
            );
        });

        it('passes when item count is within bounds', () => {
            const config: ListConfig = { fields: [questionField()], minItems: 1, maxItems: 2 };
            const value: ListValue = { items: [item({ name: 'Ava' })] };

            const errors = validateListValue(value, config, 'children');

            expect(errors).toEqual({});
        });
    });

    // ---- AC2: required field inside an item, at any depth ----
    describe('required fields inside items (AC2)', () => {
        it('errors when a required field is empty', () => {
            const config: ListConfig = { fields: [questionField({ alias: 'name', title: 'Name', required: true })] };
            const value: ListValue = { items: [item({ name: '' })] };

            const errors = validateListValue(value, config, 'children');

            expect(errors['children[0].name']).toEqual(['Name is required']);
        });

        it('does not error when a required field is filled', () => {
            const config: ListConfig = { fields: [questionField({ alias: 'name', title: 'Name', required: true })] };
            const value: ListValue = { items: [item({ name: 'Ava' })] };

            const errors = validateListValue(value, config, 'children');

            expect(errors).toEqual({});
        });

        it('errors on a required field nested three levels deep', () => {
            const grandchildConfig: ListConfig = {
                fields: [questionField({ alias: 'street', title: 'Street', required: true })],
            };
            const addressConfig: ListConfig = {
                fields: [listField({ alias: 'addresses', list: grandchildConfig })],
            };
            const childConfig: ListConfig = {
                fields: [listField({ alias: 'homes', list: addressConfig })],
            };
            const value: ListValue = {
                items: [
                    item({
                        homes: {
                            items: [item({ addresses: { items: [item({ street: '' }, 'addr-0')] } }, 'home-0')],
                        },
                    }, 'child-0'),
                ],
            };

            const errors = validateListValue(value, childConfig, 'children');

            expect(errors['children[0].homes[0].addresses[0].street']).toEqual(['Street is required']);
        });
    });

    // ---- AC3: hidden fields (visibleIf) are not validated ----
    describe('visibleIf (AC3)', () => {
        it('skips a required field hidden by visibleIf', () => {
            const config: ListConfig = {
                fields: [
                    questionField({ alias: 'hasMiddleName', type: 'boolean' }),
                    questionField({
                        alias: 'middleName',
                        title: 'Middle name',
                        required: true,
                        visibleIf: {
                            type: 'group',
                            id: 'g1',
                            operator: 'AND',
                            conditions: [
                                {
                                    type: 'condition',
                                    id: 'c1',
                                    variable: 'hasMiddleName',
                                    operator: 'equals',
                                    value: true,
                                    valueType: 'constant',
                                },
                            ],
                        },
                    }),
                ],
            };
            const value: ListValue = { items: [item({ hasMiddleName: false, middleName: '' })] };

            const errors = validateListValue(value, config, 'children');

            expect(errors).toEqual({});
        });

        it('validates a required field visible by visibleIf', () => {
            const config: ListConfig = {
                fields: [
                    questionField({ alias: 'hasMiddleName', type: 'boolean' }),
                    questionField({
                        alias: 'middleName',
                        title: 'Middle name',
                        required: true,
                        visibleIf: {
                            type: 'group',
                            id: 'g1',
                            operator: 'AND',
                            conditions: [
                                {
                                    type: 'condition',
                                    id: 'c1',
                                    variable: 'hasMiddleName',
                                    operator: 'equals',
                                    value: true,
                                    valueType: 'constant',
                                },
                            ],
                        },
                    }),
                ],
            };
            const value: ListValue = { items: [item({ hasMiddleName: true, middleName: '' })] };

            const errors = validateListValue(value, config, 'children');

            expect(errors['children[0].middleName']).toEqual(['Middle name is required']);
        });
    });

    // ---- AC4: errors keyed by path ----
    describe('path-keyed errors (AC4)', () => {
        it('keys a nested error by bracketed index + dotted alias path', () => {
            const addressConfig: ListConfig = {
                fields: [questionField({ alias: 'street', title: 'Street', required: true })],
            };
            const childConfig: ListConfig = {
                fields: [listField({ alias: 'addresses', list: addressConfig })],
            };
            const value: ListValue = {
                items: [
                    item({ addresses: { items: [item({ street: 'ok' }, 'a0'), item({ street: '' }, 'a1')] } }, 'c0'),
                ],
            };

            const errors = validateListValue(value, childConfig, 'children');

            expect(Object.keys(errors)).toEqual(['children[0].addresses[1].street']);
        });
    });

    // ---- AC5: depth cap ----
    describe('depth cap (AC5)', () => {
        function buildNested(levels: number): { config: ListConfig; value: ListValue } {
            // Innermost level has one required, empty field so a passing depth
            // would otherwise still surface a real validation error.
            let config: ListConfig = { fields: [questionField({ alias: 'leaf', title: 'Leaf', required: true })] };
            let value: ListValue = { items: [item({ leaf: '' })] };

            for (let i = 1; i < levels; i++) {
                config = { fields: [listField({ alias: 'nested', list: config })] };
                value = { items: [item({ nested: value })] };
            }
            return { config, value };
        }

        it(`rejects a value nested deeper than ${LIST_VALIDATION_MAX_DEPTH} levels without crashing`, () => {
            const { config, value } = buildNested(LIST_VALIDATION_MAX_DEPTH + 1);

            expect(() => validateListValue(value, config, 'root')).not.toThrow();
            const errors = validateListValue(value, config, 'root');
            const messages = Object.values(errors).flat();
            expect(messages.some((m) => m.includes('maximum depth'))).toBe(true);
        });

        it(`accepts a value nested exactly ${LIST_VALIDATION_MAX_DEPTH} levels deep and still reports the real leaf error`, () => {
            const { config, value } = buildNested(LIST_VALIDATION_MAX_DEPTH);

            const errors = validateListValue(value, config, 'root');
            const messages = Object.values(errors).flat();
            expect(messages.some((m) => m.includes('maximum depth'))).toBe(false);
            expect(messages).toContain('Leaf is required');
        });

        it('accepts an ordinary 3-level nest with no depth error', () => {
            const { config, value } = buildNested(3);

            const errors = validateListValue(value, config, 'root');
            const messages = Object.values(errors).flat();
            expect(messages.some((m) => m.includes('maximum depth'))).toBe(false);
        });
    });

    // ---- AC6: total item cap ----
    describe('total item cap (AC6)', () => {
        it(`rejects a value with more than ${LIST_VALIDATION_MAX_TOTAL_ITEMS} total items`, () => {
            const config: ListConfig = { fields: [questionField()] };
            const items: ListItem[] = Array.from({ length: LIST_VALIDATION_MAX_TOTAL_ITEMS + 1 }, (_, i) =>
                item({ name: `n${i}` }, `id-${i}`)
            );
            const value: ListValue = { items };

            expect(() => validateListValue(value, config, 'children')).not.toThrow();
            const errors = validateListValue(value, config, 'children');
            const messages = Object.values(errors).flat();
            expect(messages.some((m) => m.includes('maximum'))).toBe(true);
        });

        it('accepts exactly the item cap with no cap error', () => {
            const config: ListConfig = { fields: [questionField()] };
            const items: ListItem[] = Array.from({ length: LIST_VALIDATION_MAX_TOTAL_ITEMS }, (_, i) =>
                item({ name: `n${i}` }, `id-${i}`)
            );
            const value: ListValue = { items };

            const errors = validateListValue(value, config, 'children');
            const messages = Object.values(errors).flat();
            expect(messages.some((m) => m.includes('maximum') && m.includes('Total item count'))).toBe(false);
        });
    });

    // ---- AC7: malformed values ----
    describe('malformed values (AC7)', () => {
        it.each([
            ['a bare string', 'not-a-list'],
            ['null', null],
            ['undefined', undefined],
            ['a number', 42],
            ['a bare array', [{ values: {} }]],
        ])('rejects %s without throwing', (_label, malformed) => {
            const config: ListConfig = { fields: [questionField()] };

            expect(() => validateListValue(malformed, config, 'children')).not.toThrow();
            const errors = validateListValue(malformed, config, 'children');
            expect(Object.values(errors).flat().length).toBeGreaterThan(0);
        });

        it('rejects a malformed item within an otherwise valid items array', () => {
            const config: ListConfig = { fields: [questionField()] };
            const value = { items: ['not-an-item', item({ name: 'Ava' })] } as unknown as ListValue;

            expect(() => validateListValue(value, config, 'children')).not.toThrow();
            const errors = validateListValue(value, config, 'children');
            expect(errors['children[0]']).toEqual(expect.arrayContaining([expect.stringContaining('Invalid list item')]));
        });

        it('keys a malformed root value under the caller-supplied path, or $root when none given', () => {
            const config: ListConfig = { fields: [questionField()] };

            expect(Object.keys(validateListValue('bad', config))).toEqual(['$root']);
            expect(Object.keys(validateListValue('bad', config, 'children'))).toEqual(['children']);
        });
    });
});
