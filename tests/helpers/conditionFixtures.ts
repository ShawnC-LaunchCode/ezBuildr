import type { ComparisonOperator, ConditionExpression } from '@shared/types/conditions';

/**
 * Test-only helper for building a one-leaf `ConditionExpression` `when`
 * payload from a (variable, operator, value) triple.
 *
 * Not a production shim: LU-6c deleted `buildSingleConditionExpression`
 * (`shared/workflowLogic.ts`) - the seam that translated the legacy flat
 * `logic_rules` shape (`operator`/`conditionValue`) into a
 * `ConditionExpression` - once nothing in production still emitted that flat
 * shape (`git log -p -- tickets/LOGIC_UNIFICATION_TICKETS.md`, LU-6c). Fixtures across
 * the suite still need a quick way to build a working `when` without hand
 * writing the group/condition tree every time; this is that convenience,
 * scoped to tests only.
 *
 * Ids are derived deterministically from the (variable, operator) pair
 * rather than randomly generated, so two calls describing the same condition
 * produce deep-equal output - useful for fixtures compared across two
 * independently-built rules (e.g. an AI-sourced vs. manually-sourced ingest).
 */
export function buildTestWhen(
  variable: string,
  operator: ComparisonOperator,
  value?: unknown
): ConditionExpression {
  return {
    type: 'group',
    id: `test-group-${variable}-${operator}`,
    operator: 'AND',
    conditions: [
      {
        type: 'condition',
        id: `test-condition-${variable}-${operator}`,
        variable,
        operator,
        value,
        valueType: 'constant',
      },
    ],
  };
}
