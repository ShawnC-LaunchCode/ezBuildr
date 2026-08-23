/**
 * LIST-7 — expanding a `list` step's variable into its field tree for the
 * builder's variable pickers (VariablesInspector, VariablePalette).
 *
 * Covers AC1 (expandable node), AC2 (each level's fields, nested lists
 * expand further), AC3 (the document-template snippet form matches the
 * docxtemplater loop syntax the doc engine accepts — see LIST-11), and AC4
 * (a List still exposes only its count operand in logic/condition pickers,
 * unchanged by this ticket).
 */
import { describe, it, expect } from 'vitest';

import { getOperatorsForStepType } from '../../../shared/types/conditions';
import type { ListConfig } from '../../../shared/types/stepConfigs';

import { buildListVariableTree } from '../../../client/src/components/builder/variables/listVariableTree';

import type { ApiStep, ApiWorkflowVariable } from '../../../client/src/lib/vault-api';

function makeStep(overrides: Partial<ApiStep> & Pick<ApiStep, 'id'>): ApiStep {
  return {
    workflowId: 'wf-1',
    pageId: 'page-1',
    type: 'list',
    title: 'Children',
    description: null,
    required: false,
    alias: null,
    order: 0,
    config: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeVariable(overrides: Partial<ApiWorkflowVariable> & Pick<ApiWorkflowVariable, 'key'>): ApiWorkflowVariable {
  return {
    alias: null,
    label: 'Children',
    type: 'list',
    pageId: 'page-1',
    pageTitle: 'Page 1',
    stepId: overrides.key,
    ...overrides,
  };
}

// children -> addresses -> occupants (3 levels, matching the initiative's
// canonical example and the LIST_VALIDATION_MAX_DEPTH cap).
const threeLevelConfig: ListConfig = {
  fields: [
    { kind: 'question', id: 'f-name', alias: 'name', type: 'short_text', title: 'Name', order: 0 },
    {
      kind: 'list',
      id: 'f-addresses',
      alias: 'addresses',
      title: 'Addresses',
      order: 1,
      list: {
        fields: [
          { kind: 'question', id: 'f-street', alias: 'street', type: 'short_text', title: 'Street', order: 0 },
          {
            kind: 'list',
            id: 'f-occupants',
            alias: 'occupants',
            title: 'Occupants',
            order: 1,
            list: {
              fields: [
                { kind: 'question', id: 'f-occname', alias: 'occName', type: 'short_text', title: 'Occupant', order: 0 },
              ],
            },
          },
        ],
      },
    },
  ],
};

describe('buildListVariableTree', () => {
  it('returns null for a non-list variable (AC1: only List steps are expandable)', () => {
    const variable = makeVariable({ key: 'step-1', type: 'short_text' });
    expect(buildListVariableTree(variable, [])).toBeNull();
  });

  it('returns null when the matching step is missing or its config is malformed', () => {
    const variable = makeVariable({ key: 'step-1' });
    expect(buildListVariableTree(variable, [])).toBeNull();

    const badStep = makeStep({ id: 'step-1', config: { notFields: true } });
    expect(buildListVariableTree(variable, [badStep])).toBeNull();
  });

  it('expands a List step into a node per top-level field (AC1, AC2)', () => {
    const variable = makeVariable({ key: 'step-1', alias: 'children' });
    const step = makeStep({ id: 'step-1', alias: 'children', config: threeLevelConfig });

    const tree = buildListVariableTree(variable, [step]);
    expect(tree).not.toBeNull();
    expect(tree?.map((node) => node.alias)).toEqual(['name', 'addresses']);

    const nameNode = tree?.[0];
    expect(nameNode?.kind).toBe('question');
    expect(nameNode?.fieldType).toBe('short_text');
    expect(nameNode?.children).toBeUndefined();

    const addressesNode = tree?.[1];
    expect(addressesNode?.kind).toBe('list');
    expect(addressesNode?.children?.map((n) => n.alias)).toEqual(['street', 'occupants']);
  });

  it('recurses to a third level (children -> addresses -> occupants)', () => {
    const variable = makeVariable({ key: 'step-1', alias: 'children' });
    const step = makeStep({ id: 'step-1', alias: 'children', config: threeLevelConfig });

    const tree = buildListVariableTree(variable, [step]);
    const occupantsNode = tree?.[1].children?.find((n) => n.alias === 'occupants');
    expect(occupantsNode?.kind).toBe('list');
    expect(occupantsNode?.children?.map((n) => n.alias)).toEqual(['occName']);
  });

  it('sorts fields by their config order regardless of array position', () => {
    const outOfOrder: ListConfig = {
      fields: [
        { kind: 'question', id: 'f-b', alias: 'second', type: 'short_text', title: 'Second', order: 1 },
        { kind: 'question', id: 'f-a', alias: 'first', type: 'short_text', title: 'First', order: 0 },
      ],
    };
    const variable = makeVariable({ key: 'step-1', alias: 'children' });
    const step = makeStep({ id: 'step-1', alias: 'children', config: outOfOrder });

    const tree = buildListVariableTree(variable, [step]);
    expect(tree?.map((n) => n.alias)).toEqual(['first', 'second']);
  });

  it('falls back to the step id when the step has no alias set', () => {
    const variable = makeVariable({ key: 'step-1', alias: null });
    const step = makeStep({
      id: 'step-1',
      alias: null,
      config: { fields: [{ kind: 'question', id: 'f-1', alias: 'name', type: 'short_text', title: 'Name', order: 0 }] },
    });

    const tree = buildListVariableTree(variable, [step]);
    expect(tree?.[0].templateSnippet).toBe('{{#step-1}}{{name}}{{/step-1}}');
  });

  describe('templateSnippet (AC3: matches the docxtemplater loop form the doc engine accepts)', () => {
    it('wraps a top-level field in exactly one open/close pair', () => {
      const variable = makeVariable({ key: 'step-1', alias: 'children' });
      const step = makeStep({ id: 'step-1', alias: 'children', config: threeLevelConfig });
      const tree = buildListVariableTree(variable, [step]);

      expect(tree?.[0].templateSnippet).toBe('{{#children}}{{name}}{{/children}}');
    });

    it('wraps a nested field in every ancestor scope, outermost first', () => {
      const variable = makeVariable({ key: 'step-1', alias: 'children' });
      const step = makeStep({ id: 'step-1', alias: 'children', config: threeLevelConfig });
      const tree = buildListVariableTree(variable, [step]);
      const streetNode = tree?.[1].children?.find((n) => n.alias === 'street');

      expect(streetNode?.templateSnippet).toBe('{{#children}}{{#addresses}}{{street}}{{/addresses}}{{/children}}');
    });

    it('gives a nested list node itself an empty-body loop shell scoped by its ancestors', () => {
      const variable = makeVariable({ key: 'step-1', alias: 'children' });
      const step = makeStep({ id: 'step-1', alias: 'children', config: threeLevelConfig });
      const tree = buildListVariableTree(variable, [step]);
      const addressesNode = tree?.[1];

      expect(addressesNode?.templateSnippet).toBe('{{#children}}{{#addresses}}{{/addresses}}{{/children}}');
    });

    it('wraps a third-level field through all three ancestor scopes', () => {
      const variable = makeVariable({ key: 'step-1', alias: 'children' });
      const step = makeStep({ id: 'step-1', alias: 'children', config: threeLevelConfig });
      const tree = buildListVariableTree(variable, [step]);
      const occNameNode = tree?.[1].children?.find((n) => n.alias === 'occupants')?.children?.find((n) => n.alias === 'occName');

      expect(occNameNode?.templateSnippet).toBe(
        '{{#children}}{{#addresses}}{{#occupants}}{{occName}}{{/occupants}}{{/addresses}}{{/children}}'
      );
    });
  });
});

describe('condition/logic operand for `list` stays count-only (AC4 — unchanged by this ticket)', () => {
  it('getOperatorsForStepType("list") exposes exactly the five count operators, no per-field operands', () => {
    const operators = getOperatorsForStepType('list');
    expect(operators.map((op) => op.value)).toEqual([
      'equals',
      'greater_than',
      'less_than',
      'is_empty',
      'is_not_empty',
    ]);
  });
});
