import { describe, it, expect } from 'vitest';

import { buildExecutionOrder, findCycle, type CodeBlockNode } from '../../../../server/services/codeBlocks/CodeBlockGraph';

/** `order` is deliberately set ADVERSARIALLY in most cases below: the point of
 * CB-4 is that the hand-set integer no longer decides execution order. */
function node(id: string, order: number, inputs: string[], outputs: string[]): CodeBlockNode {
  return { id, order, inputs, outputs };
}

describe('CodeBlockGraph — AC 2: order is derived from declared inputs/outputs, not the order integer', () => {
  it('runs a producer before its consumer even when the order integer says the opposite', () => {
    // B has the LOWER order integer, so a naive sort would run it first and it
    // would read A's previous output -- the exact bug CB-4 exists to remove.
    const b = node('B', 1, ['gross_total'], ['net_total']);
    const a = node('A', 99, ['income'], ['gross_total']);
    expect(buildExecutionOrder([b, a])).toEqual(['A', 'B']);
  });

  it('resolves a three-deep chain A -> B -> C in one pass, in order', () => {
    const c = node('C', 1, ['net_total'], ['final_total']);
    const b = node('B', 2, ['gross_total'], ['net_total']);
    const a = node('A', 3, ['income'], ['gross_total']);
    expect(buildExecutionOrder([c, b, a])).toEqual(['A', 'B', 'C']);
  });

  it('treats an input with no producing block as a plain question, not an edge', () => {
    const a = node('A', 1, ['a_question_nobody_writes'], ['out']);
    expect(buildExecutionOrder([a])).toEqual(['A']);
  });

  it('ignores a block that consumes its own output rather than deadlocking on it', () => {
    const a = node('A', 1, ['x'], ['x']);
    expect(buildExecutionOrder([a])).toEqual(['A']);
  });
});

describe('CodeBlockGraph — AC 6: independent blocks get a stable, deterministic order', () => {
  const independent = [
    node('zeta', 2, ['q1'], ['out_z']),
    node('alpha', 1, ['q2'], ['out_a']),
    node('mid', 2, ['q3'], ['out_m']),
  ];

  it('orders by the order integer, then by id, when nothing else constrains them', () => {
    expect(buildExecutionOrder(independent)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('returns the same order regardless of the input array order', () => {
    const shuffled = [independent[2], independent[0], independent[1]];
    expect(buildExecutionOrder(shuffled)).toEqual(buildExecutionOrder(independent));
  });
});

describe('CodeBlockGraph — AC 3: cycles are detected and named in the author\'s vocabulary', () => {
  it('detects a two-block cycle and names the variables, not the step ids', () => {
    const a = node('A', 1, ['net_income'], ['support_total']);
    const b = node('B', 2, ['support_total'], ['net_income']);
    const cycle = findCycle([a, b]);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain('support_total');
    expect(cycle).toContain('net_income');
  });

  it('throws from buildExecutionOrder with a message naming the cycle', () => {
    const a = node('A', 1, ['net_income'], ['support_total']);
    const b = node('B', 2, ['support_total'], ['net_income']);
    expect(() => buildExecutionOrder([a, b])).toThrow(/cycle/i);
    expect(() => buildExecutionOrder([a, b])).toThrow(/support_total/);
  });

  it('uses the "Validation error" prefix the route error contract maps to 400', () => {
    // server/utils/routeErrors.ts classifies by message text; a different
    // phrasing would surface as a 500 to the author saving the block.
    const a = node('A', 1, ['y'], ['x']);
    const b = node('B', 2, ['x'], ['y']);
    expect(() => buildExecutionOrder([a, b])).toThrow(/^Validation error:/);
  });

  it('detects a three-block cycle A -> B -> C -> A', () => {
    const a = node('A', 1, ['c_out'], ['a_out']);
    const b = node('B', 2, ['a_out'], ['b_out']);
    const c = node('C', 3, ['b_out'], ['c_out']);
    expect(findCycle([a, b, c])).not.toBeNull();
    expect(() => buildExecutionOrder([a, b, c])).toThrow(/cycle/i);
  });

  it('returns null for an acyclic graph, including a diamond', () => {
    // A feeds both B and C; D consumes both. Acyclic despite two paths.
    const a = node('A', 1, [], ['a_out']);
    const b = node('B', 2, ['a_out'], ['b_out']);
    const c = node('C', 3, ['a_out'], ['c_out']);
    const d = node('D', 4, ['b_out', 'c_out'], ['d_out']);
    expect(findCycle([a, b, c, d])).toBeNull();
    const order = buildExecutionOrder([d, c, b, a]);
    expect(order[0]).toBe('A');
    expect(order[3]).toBe('D');
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
  });
});
