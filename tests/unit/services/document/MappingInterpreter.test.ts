/**
 * MappingInterpreter — GH-156 binding kinds.
 *
 * `applyMapping` originally only understood `{ type: 'variable', source }`.
 * GH-156 widened the binding union to `constant`, `formula`, and `datavault`
 * (the last resolved out-of-band by `resolveDatavaultBindings`, since a DB
 * lookup can't happen inside a synchronous, pure function). These tests pin
 * down that each kind actually resolves — and that the ones which cannot
 * degrade to `missing` rather than throwing or vanishing silently.
 */
import { describe, it, expect } from 'vitest';

import {
    applyMapping,
    evaluateFormulaExpression,
    resolveBindingToString,
    resolveDatavaultBindings,
    validateMapping,
    describeMapping,
    type DocumentMapping,
} from '../../../../server/services/document/MappingInterpreter';
import type { NormalizedData } from '../../../../server/services/document/VariableNormalizer';

describe('evaluateFormulaExpression', () => {
    it('substitutes every {{alias}} token', () => {
        const result = evaluateFormulaExpression('Dear {{firstName}} {{lastName}},', {
            firstName: 'Ada',
            lastName: 'Lovelace',
        });
        expect(result.value).toBe('Dear Ada Lovelace,');
        expect(result.refs).toEqual(['firstName', 'lastName']);
        expect(result.missingRefs).toEqual([]);
    });

    it('substitutes a missing reference with an empty string and reports it', () => {
        const result = evaluateFormulaExpression('Dear {{nope}},', {});
        expect(result.value).toBe('Dear ,');
        expect(result.missingRefs).toEqual(['nope']);
    });

    it('passes through a string with no tokens unchanged', () => {
        const result = evaluateFormulaExpression('Static text', {});
        expect(result.value).toBe('Static text');
        expect(result.refs).toEqual([]);
    });

    it('supports a dotted path token', () => {
        const result = evaluateFormulaExpression('{{address.city}}', { 'address.city': 'Springfield' });
        expect(result.value).toBe('Springfield');
        expect(result.missingRefs).toEqual([]);
    });
});

describe('applyMapping — GH-156 binding kinds', () => {
    const data: NormalizedData = { firstName: 'Ada', total: 42 };

    it('resolves a constant binding regardless of source data', () => {
        const mapping: DocumentMapping = { firm_name: { type: 'constant', value: 'Acme Legal' } };
        const result = applyMapping(data, mapping);
        expect(result.data.firm_name).toBe('Acme Legal');
        expect(result.mapped).toContain('firm_name');
        expect(result.missing).toEqual([]);
    });

    it('resolves a formula binding via substitution', () => {
        const mapping: DocumentMapping = { greeting: { type: 'formula', expression: 'Hi {{firstName}}!' } };
        const result = applyMapping(data, mapping);
        expect(result.data.greeting).toBe('Hi Ada!');
        expect(result.mapped).toContain('greeting');
    });

    it('treats an unresolved datavault binding as missing, not silently dropped', () => {
        const mapping: DocumentMapping = {
            firm_name: { type: 'datavault', tableId: 't1', columnId: 'c1', rowId: 'r1' },
        };
        const result = applyMapping(data, mapping);
        expect(result.missing).toContain('firm_name');
        expect(result.mapped).not.toContain('firm_name');
        expect(result.data.firm_name).toBeUndefined();
    });

    it('still resolves a plain variable binding (backward compatibility)', () => {
        const mapping: DocumentMapping = { client_name: { type: 'variable', source: 'firstName' } };
        const result = applyMapping(data, mapping);
        expect(result.data.client_name).toBe('Ada');
    });
});

describe('resolveDatavaultBindings', () => {
    it('rewrites a resolved datavault binding into a variable binding on a synthetic key', async () => {
        const mapping: DocumentMapping = {
            firm_name: { type: 'datavault', tableId: 't1', columnId: 'c1', rowId: 'r1' },
        };
        const resolveRow = async () => 'Acme LLP';

        const resolved = await resolveDatavaultBindings(mapping, {}, resolveRow);
        expect(resolved.mapping?.firm_name).toEqual({ type: 'variable', source: '__datavault__firm_name' });
        expect(resolved.normalizedData.__datavault__firm_name).toBe('Acme LLP');

        // And applyMapping now resolves it normally.
        const result = applyMapping(resolved.normalizedData, resolved.mapping);
        expect(result.data.firm_name).toBe('Acme LLP');
    });

    it('leaves the binding as datavault (unresolved) when the resolver returns undefined', async () => {
        const mapping: DocumentMapping = {
            firm_name: { type: 'datavault', tableId: 't1', columnId: 'c1', rowId: 'r1' },
        };
        const resolved = await resolveDatavaultBindings(mapping, {}, async () => undefined);
        expect(resolved.mapping?.firm_name).toEqual({ type: 'datavault', tableId: 't1', columnId: 'c1', rowId: 'r1' });
    });

    it('leaves the binding as datavault (unresolved) when the resolver throws', async () => {
        const mapping: DocumentMapping = {
            firm_name: { type: 'datavault', tableId: 't1', columnId: 'c1', rowId: 'r1' },
        };
        const resolved = await resolveDatavaultBindings(mapping, {}, async () => {
            throw new Error('Access denied — cross-tenant row');
        });
        expect(resolved.mapping?.firm_name.type).toBe('datavault');
    });

    it('is a no-op when the mapping has no datavault bindings', async () => {
        const mapping: DocumentMapping = { client_name: { type: 'variable', source: 'firstName' } };
        const resolved = await resolveDatavaultBindings(mapping, { firstName: 'Ada' }, async () => {
            throw new Error('should not be called');
        });
        expect(resolved.mapping).toEqual(mapping);
    });
});

describe('resolveBindingToString', () => {
    it('resolves each binding kind to a display string', () => {
        expect(resolveBindingToString({ type: 'variable', source: 'x' }, { x: 'hello' })).toBe('hello');
        expect(resolveBindingToString({ type: 'constant', value: 'fixed' }, {})).toBe('fixed');
        expect(resolveBindingToString({ type: 'formula', expression: 'Hi {{x}}' }, { x: 'Ada' })).toBe('Hi Ada');
        expect(resolveBindingToString({ type: 'datavault', tableId: 't', columnId: 'c', rowId: 'r' }, {})).toBe('');
        expect(resolveBindingToString(undefined, {})).toBe('');
    });
});

describe('validateMapping — GH-156 binding kinds', () => {
    it('is valid for a constant binding', () => {
        const report = validateMapping({ firm_name: { type: 'constant', value: 'Acme' } }, {});
        expect(report.valid).toBe(true);
        expect(report.errors).toEqual([]);
    });

    it('warns on a formula referencing an unknown variable', () => {
        const report = validateMapping({ greeting: { type: 'formula', expression: 'Hi {{nope}}' } }, {});
        expect(report.valid).toBe(true); // warning, not error
        expect(report.warnings.some(w => w.includes('nope'))).toBe(true);
    });

    it('errors on an incomplete datavault binding', () => {
        const report = validateMapping(
            { firm_name: { type: 'datavault', tableId: '', columnId: 'c', rowId: 'r' } },
            {}
        );
        expect(report.valid).toBe(false);
        expect(report.errors.some(e => e.includes('Incomplete DataVault'))).toBe(true);
    });

    it('flags an unrecognized binding type as a warning, not an error', () => {
        const mapping = { field: { type: 'unknown-kind' } } as unknown as DocumentMapping;
        const report = validateMapping(mapping, {});
        expect(report.valid).toBe(true);
        expect(report.warnings.some(w => w.includes('Unknown mapping type'))).toBe(true);
    });
});

describe('describeMapping — GH-156 binding kinds', () => {
    it('describes each binding kind readably', () => {
        const description = describeMapping({
            a: { type: 'variable', source: 'alias' },
            b: { type: 'constant', value: 'fixed' },
            c: { type: 'formula', expression: '{{x}}' },
            d: { type: 'datavault', tableId: 't', columnId: 'c', rowId: 'r' },
        });
        expect(description).toContain('a ← alias');
        expect(description).toContain("b ← 'fixed'");
        expect(description).toContain('c ← {{x}}');
        expect(description).toContain('d ← datavault:t/c/r');
    });
});
