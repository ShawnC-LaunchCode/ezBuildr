/**
 * ICW2-10 — the propose path has no "after" state to diff against, so the
 * review list is derived from the ops themselves. These cases pin the mapping
 * so the user reviews an accurate description of what Apply will run.
 */
import { describe, it, expect } from 'vitest';

import { buildOpsDiff } from '../../../shared/aiOpsDiff';

import type { WorkflowPatchOp } from '../../../shared/validation/aiWorkflowEdit.schema';

describe('buildOpsDiff', () => {
    it('returns one change per op, in op order', () => {
        const ops: WorkflowPatchOp[] = [
            { op: 'page.create', tempId: 't1', title: 'Contact', order: 1 },
            { op: 'step.create', pageRef: 't1', type: 'email', title: 'Email' },
            { op: 'step.setRequired', id: 'step-1', required: true },
        ];

        expect(buildOpsDiff(ops)).toEqual([
            { type: 'add', entity: 'page', explanation: 'Add page "Contact"' },
            { type: 'add', entity: 'step', explanation: 'Add email question "Email"' },
            { type: 'update', entity: 'step', explanation: 'Make question step-1 required' },
        ]);
    });

    it('classifies each op family by change type', () => {
        const ops: WorkflowPatchOp[] = [
            { op: 'page.delete', id: 'page-1' },
            { op: 'page.reorder', pageIds: ['a', 'b', 'c'] },
            { op: 'step.move', id: 'step-1', toPageId: 'page-2' },
            { op: 'logicRule.create', rule: { condition: 'age > 18', action: 'show', target: { type: 'step', id: 'step-9' } } },
            { op: 'logicRule.delete', id: 'rule-1' },
        ];

        expect(buildOpsDiff(ops).map((c) => `${c.type}:${c.entity}`)).toEqual([
            'remove:page',
            'move:page',
            'move:step',
            'add:logic',
            'remove:logic',
        ]);
    });

    it('distinguishes setting from clearing a visibility condition', () => {
        const ops: WorkflowPatchOp[] = [
            {
                op: 'step.setVisibleIf',
                id: 'step-1',
                visibleIf: {
                    type: 'group',
                    id: 'g1',
                    operator: 'AND',
                    conditions: [
                        { type: 'condition', id: 'c1', variable: 'has_pet', operator: 'is_true', valueType: 'constant' },
                    ],
                },
            },
            { op: 'step.setVisibleIf', id: 'step-2', visibleIf: null },
        ];

        const [set, cleared] = buildOpsDiff(ops);
        expect(set.explanation).toBe('Make question step-1 conditional');
        expect(cleared.explanation).toBe('Always show question step-2');
    });

    it('falls back to the entity reference when an op carries no title', () => {
        const ops: WorkflowPatchOp[] = [
            { op: 'page.update', id: 'page-7', order: 3 },
            { op: 'step.update', tempId: 'temp-4', required: false },
        ];

        expect(buildOpsDiff(ops).map((c) => c.explanation)).toEqual([
            'Update page page-7',
            'Update question temp-4',
        ]);
    });

    it('summarizes counted operations rather than listing their contents', () => {
        const ops: WorkflowPatchOp[] = [
            { op: 'document.bindFields', id: 'doc-1', bindings: { name: 'full_name', dob: 'birth_date' } },
            {
                op: 'datavault.createTable',
                databaseId: 'db-1',
                name: 'Applicants',
                columns: [{ name: 'email', type: 'text' }, { name: 'age', type: 'number' }],
            },
        ];

        expect(buildOpsDiff(ops).map((c) => c.explanation)).toEqual([
            'Bind 2 document fields',
            'Create table "Applicants" with 2 columns',
        ]);
    });

    it('returns an empty list for an empty op set', () => {
        expect(buildOpsDiff([])).toEqual([]);
    });
});
