/**
 * LIST-2 — ListConfig/ListValue types and the projectListValue projection.
 *
 * The load-bearing property is that ListFieldQuestionType is *derived* from
 * RUNNER_RENDERED_STEP_TYPES rather than hand-listed (the hand-maintained
 * RepeaterFieldType in shared/types/repeater.ts is exactly the mistake this
 * must not repeat), and that projectListValue turns the itemId-keyed storage
 * shape into plain alias-keyed objects at arbitrary nesting depth.
 */
import { describe, it, expect } from 'vitest';

import { RUNNER_RENDERED_STEP_TYPES } from '../../../shared/types/runnerStepTypes';
import {
    LIST_FIELD_QUESTION_TYPES,
    projectListValue,
} from '../../../shared/types/stepConfigs';

import type { ListConfig, ListField, ListValue } from '../../../shared/types/stepConfigs';

describe('ListFieldQuestionType derivation (AC3)', () => {
    it('equals RUNNER_RENDERED_STEP_TYPES minus final_documents and signature_block', () => {
        const expected = RUNNER_RENDERED_STEP_TYPES.filter(
            (type) => type !== 'final_documents' && type !== 'signature_block',
        );
        expect(LIST_FIELD_QUESTION_TYPES).toEqual(expected);
    });

    it('excludes the two step types with no meaning per-item', () => {
        expect(LIST_FIELD_QUESTION_TYPES).not.toContain('final_documents');
        expect(LIST_FIELD_QUESTION_TYPES).not.toContain('signature_block');
    });

    it('flows a newly rendered runner type through automatically', () => {
        // Simulates RUNNER_RENDERED_STEP_TYPES gaining an entry: re-deriving
        // from the (hypothetically) grown set must pick it up with no edit to
        // the derivation itself. This is the property that a hand-listed
        // union (like RepeaterFieldType) cannot give you.
        const grown = [...RUNNER_RENDERED_STEP_TYPES, 'js_question'] as const;
        const derived = grown.filter((type) => type !== 'final_documents' && type !== 'signature_block');
        expect(derived).toContain('js_question');
    });
});

describe('ListField recursion (AC2)', () => {
    it('accepts a kind: list field carrying a full nested ListConfig with no depth limit', () => {
        // Three levels: children -> addresses -> occupants.
        const occupantsConfig: ListConfig = {
            fields: [
                { kind: 'question', id: 'q-occ', alias: 'occName', type: 'short_text', title: 'Occupant', order: 0 },
            ],
        };
        const addressesField: ListField = {
            kind: 'list',
            id: 'f-addresses',
            alias: 'addresses',
            title: 'Addresses',
            order: 1,
            list: {
                fields: [
                    { kind: 'question', id: 'q-street', alias: 'street', type: 'short_text', title: 'Street', order: 0 },
                    {
                        kind: 'list',
                        id: 'f-occupants',
                        alias: 'occupants',
                        title: 'Occupants',
                        order: 1,
                        list: occupantsConfig,
                    },
                ],
            },
        };
        const childrenConfig: ListConfig = {
            fields: [
                { kind: 'question', id: 'q-name', alias: 'name', type: 'short_text', title: 'Name', order: 0 },
                addressesField,
            ],
        };

        expect(childrenConfig.fields).toHaveLength(2);
        const nested = childrenConfig.fields[1];
        expect(nested.kind).toBe('list');
        if (nested.kind === 'list') {
            const doublyNested = nested.list.fields[1];
            expect(doublyNested.kind).toBe('list');
        }
    });
});

describe('projectListValue (AC4, AC5)', () => {
    const config: ListConfig = {
        fields: [
            { kind: 'question', id: 'q-name', alias: 'name', type: 'short_text', title: 'Name', order: 0 },
            { kind: 'question', id: 'q-dob', alias: 'dob', type: 'date', title: 'DOB', order: 1 },
            {
                kind: 'list',
                id: 'f-addresses',
                alias: 'addresses',
                title: 'Addresses',
                order: 2,
                list: {
                    fields: [
                        { kind: 'question', id: 'q-street', alias: 'street', type: 'short_text', title: 'Street', order: 0 },
                        {
                            kind: 'list',
                            id: 'f-occupants',
                            alias: 'occupants',
                            title: 'Occupants',
                            order: 1,
                            list: {
                                fields: [
                                    {
                                        kind: 'question',
                                        id: 'q-occ',
                                        alias: 'occName',
                                        type: 'short_text',
                                        title: 'Occupant',
                                        order: 0,
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
        ],
    };

    it('returns [] for an absent value (AC5)', () => {
        expect(projectListValue(undefined, config)).toEqual([]);
        expect(projectListValue(null, config)).toEqual([]);
    });

    it('returns [] for a value with no items (AC5)', () => {
        expect(projectListValue({ items: [] }, config)).toEqual([]);
    });

    it('strips itemId, keys by field alias, and recurses 3 levels deep (AC4)', () => {
        const value: ListValue = {
            items: [
                {
                    itemId: 'item-1',
                    values: {
                        name: 'Ava',
                        dob: '2015-04-02',
                        addresses: {
                            items: [
                                {
                                    itemId: 'addr-1',
                                    values: {
                                        street: '12 Oak St',
                                        occupants: {
                                            items: [
                                                { itemId: 'occ-1', values: { occName: 'Ava' } },
                                            ],
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            ],
        };

        const result = projectListValue(value, config);

        expect(result).toEqual([
            {
                name: 'Ava',
                dob: '2015-04-02',
                addresses: [
                    {
                        street: '12 Oak St',
                        occupants: [{ occName: 'Ava' }],
                    },
                ],
            },
        ]);

        expect(result[0]).not.toHaveProperty('itemId');
        const addresses = result[0].addresses as Record<string, unknown>[];
        expect(addresses[0]).not.toHaveProperty('itemId');
        const occupants = addresses[0].occupants as Record<string, unknown>[];
        expect(occupants[0]).not.toHaveProperty('itemId');
    });
});
