import { describe, it, expect } from 'vitest';

import { runGraph, type RunGraphInput } from '@server/engine/index';
import type {  } from '@server/engine/registry';
import { validateNodeConditions, validateGraph, type GraphJson } from '@server/engine/validate';

import type { WorkflowVersion } from '@shared/schema';
describe('Engine - Conditional Execution', () => {
  const fixedClock = () => new Date('2024-01-15T12:00:00Z');
  describe('Graph Validation', () => {
    it('should validate a simple graph', () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'name',
              questionText: 'What is your name?',
              questionType: 'text',
            },
          },
        ],
        startNodeId: 'q1',
      };
      const result = validateGraph(graph);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    it('should detect duplicate node IDs', () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: { key: 'name', questionText: 'Name?', questionType: 'text' },
          },
          {
            id: 'q1',
            type: 'question',
            config: { key: 'email', questionText: 'Email?', questionType: 'text' },
          },
        ],
        startNodeId: 'q1',
      };
      const result = validateGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Duplicate'))).toBe(true);
    });
    it('should detect invalid edge references', () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: { key: 'name', questionText: 'Name?', questionType: 'text' },
          },
        ],
        edges: [{ id: 'e1', source: 'q1', target: 'q2' }],
        startNodeId: 'q1',
      };
      const result = validateGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('non-existent'))).toBe(true);
    });
  });
  describe('Expression Validation', () => {
    it('should validate node conditions', () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'has_code',
              questionText: 'Do you have a code?',
              questionType: 'boolean',
            },
          },
          {
            id: 'q2',
            type: 'question',
            config: {
              key: 'code',
              questionText: 'Enter code',
              questionType: 'text',
              condition: 'has_code == true',
            },
          },
        ],
        edges: [{ id: 'e1', source: 'q1', target: 'q2' }],
        startNodeId: 'q1',
      };
      const result = validateNodeConditions(graph);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    it('should detect typos in variable names', () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'amount',
              questionText: 'Amount?',
              questionType: 'number',
            },
          },
          {
            id: 'c1',
            type: 'compute',
            config: {
              outputKey: 'total',
              expression: 'ammount * 1.0825', // Typo: ammount instead of amount
            },
          },
        ],
        edges: [{ id: 'e1', source: 'q1', target: 'c1' }],
        startNodeId: 'q1',
      };
      const result = validateNodeConditions(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('ammount'))).toBe(true);
    });
    it('should validate compute node expressions', () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'amount',
              questionText: 'Amount?',
              questionType: 'number',
            },
          },
          {
            id: 'c1',
            type: 'compute',
            config: {
              outputKey: 'total',
              expression: 'roundTo(amount * 1.0825, 2)',
            },
          },
        ],
        edges: [{ id: 'e1', source: 'q1', target: 'c1' }],
        startNodeId: 'q1',
      };
      const result = validateNodeConditions(graph);
      expect(result.valid).toBe(true);
    });
    it('should validate branch conditions', () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'age',
              questionText: 'Age?',
              questionType: 'number',
            },
          },
          {
            id: 'b1',
            type: 'branch',
            config: {
              branches: [
                { condition: 'age < 18', targetNodeId: 'minor' },
                { condition: 'age >= 18', targetNodeId: 'adult' },
              ],
            },
          },
        ],
        edges: [{ id: 'e1', source: 'q1', target: 'b1' }],
        startNodeId: 'q1',
      };
      const result = validateNodeConditions(graph);
      expect(result.valid).toBe(true);
    });
    it('should validate template bindings', () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'name',
              questionText: 'Name?',
              questionType: 'text',
            },
          },
          {
            id: 't1',
            type: 'template',
            config: {
              templateId: 'template-123',
              bindings: {
                customer_name: 'upper(name)',
                date: '"2024-01-15"',
              },
            },
          },
        ],
        edges: [{ id: 'e1', source: 'q1', target: 't1' }],
        startNodeId: 'q1',
      };
      const result = validateNodeConditions(graph);
      expect(result.valid).toBe(true);
    });
  });
  describe('Conditional Execution', () => {
    it('should skip question when condition is false', async () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'has_code',
              questionText: 'Do you have a code?',
              questionType: 'boolean',
            },
          },
          {
            id: 'q2',
            type: 'question',
            config: {
              key: 'code',
              questionText: 'Enter code',
              questionType: 'text',
              condition: 'has_code == true',
            },
          },
        ],
        edges: [{ id: 'e1', source: 'q1', target: 'q2' }],
        startNodeId: 'q1',
      };
      const workflowVersion = {
        id: 'test-version',
        graphJson: graph,
      } as WorkflowVersion;
      const input: RunGraphInput = {
        workflowVersion,
        inputJson: {
          q1: false, // Answer for q1 (by node ID)
          // Note: code is not provided because q2 should be skipped
        },
        tenantId: 'test-tenant',
        options: { debug: true, clock: fixedClock },
      };
      const result = await runGraph(input);
      expect(result.status).toBe('success');
      expect(result.trace).toBeDefined();
      // Find trace entry for q2
      const q2Trace = result.trace?.find(t => t.nodeId === 'q2');
      expect(q2Trace).toBeDefined();
      expect(q2Trace?.status).toBe('skipped');
      expect(q2Trace?.conditionResult).toBe(false);
    });
    it('should execute question when condition is true', async () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'has_code',
              questionText: 'Do you have a code?',
              questionType: 'boolean',
            },
          },
          {
            id: 'q2',
            type: 'question',
            config: {
              key: 'code',
              questionText: 'Enter code',
              questionType: 'text',
              condition: 'has_code == true',
            },
          },
        ],
        edges: [{ id: 'e1', source: 'q1', target: 'q2' }],
        startNodeId: 'q1',
      };
      const workflowVersion = {
        id: 'test-version',
        graphJson: graph,
      } as WorkflowVersion;
      const input: RunGraphInput = {
        workflowVersion,
        inputJson: {
          q1: true, // Answer for q1 (by node ID)
          q2: 'ABC123', // Answer for q2 (by node ID)
        },
        tenantId: 'test-tenant',
        options: { debug: true, clock: fixedClock },
      };
      const result = await runGraph(input);
      expect(result.status).toBe('success');
      expect(result.trace).toBeDefined();
      // Find trace entry for q2
      const q2Trace = result.trace?.find(t => t.nodeId === 'q2');
      expect(q2Trace).toBeDefined();
      expect(q2Trace?.status).toBe('executed');
      expect(q2Trace?.conditionResult).toBe(true);
      expect(q2Trace?.outputsDelta).toEqual({ code: 'ABC123' });
    });
    it('should skip compute node when condition is false', async () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'amount',
              questionText: 'Amount?',
              questionType: 'number',
            },
          },
          {
            id: 'c1',
            type: 'compute',
            config: {
              outputKey: 'tax',
              expression: 'roundTo(amount * 0.0825, 2)',
              condition: 'amount > 0',
            },
          },
        ],
        edges: [{ id: 'e1', source: 'q1', target: 'c1' }],
        startNodeId: 'q1',
      };
      const workflowVersion = {
        id: 'test-version',
        graphJson: graph,
      } as WorkflowVersion;
      const input: RunGraphInput = {
        workflowVersion,
        inputJson: {
          q1: 0, // amount = 0
        },
        tenantId: 'test-tenant',
        options: { debug: true, clock: fixedClock },
      };
      const result = await runGraph(input);
      expect(result.status).toBe('success');
      expect(result.trace).toBeDefined();
      // Find trace entry for c1
      const c1Trace = result.trace?.find(t => t.nodeId === 'c1');
      expect(c1Trace).toBeDefined();
      expect(c1Trace?.status).toBe('skipped');
      // tax variable should not be set
      expect(c1Trace?.outputsDelta).toBeUndefined();
    });
    it('should execute compute node when condition is true', async () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'amount',
              questionText: 'Amount?',
              questionType: 'number',
            },
          },
          {
            id: 'c1',
            type: 'compute',
            config: {
              outputKey: 'tax',
              expression: 'roundTo(amount * 0.0825, 2)',
              condition: 'amount > 0',
            },
          },
        ],
        edges: [{ id: 'e1', source: 'q1', target: 'c1' }],
        startNodeId: 'q1',
      };
      const workflowVersion = {
        id: 'test-version',
        graphJson: graph,
      } as WorkflowVersion;
      const input: RunGraphInput = {
        workflowVersion,
        inputJson: {
          q1: 100,
        },
        tenantId: 'test-tenant',
        options: { debug: true, clock: fixedClock },
      };
      const result = await runGraph(input);
      expect(result.status).toBe('success');
      expect(result.trace).toBeDefined();
      // Find trace entry for c1
      const c1Trace = result.trace?.find(t => t.nodeId === 'c1');
      expect(c1Trace).toBeDefined();
      expect(c1Trace?.status).toBe('executed');
      expect(c1Trace?.outputsDelta?.tax).toBe(8.25);
    });
    it('should handle complex workflow with multiple conditions', async () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'has_code',
              questionText: 'Do you have a code?',
              questionType: 'boolean',
            },
          },
          {
            id: 'q2',
            type: 'question',
            config: {
              key: 'commission_number',
              questionText: 'Commission number?',
              questionType: 'text',
              condition: 'has_code == true',
            },
          },
          {
            id: 'q3',
            type: 'question',
            config: {
              key: 'amount',
              questionText: 'Amount?',
              questionType: 'number',
            },
          },
          {
            id: 'c1',
            type: 'compute',
            config: {
              outputKey: 'total',
              expression: 'roundTo(amount * 1.0825, 2)',
              condition: 'amount > 0',
            },
          },
          {
            id: 't1',
            type: 'template',
            config: {
              templateId: 'template-123',
              bindings: {
                name: '"Test"',
                amount: 'amount',
              },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'q1', target: 'q2' },
          { id: 'e2', source: 'q2', target: 'q3' },
          { id: 'e3', source: 'q3', target: 'c1' },
          { id: 'e4', source: 'c1', target: 't1' },
        ],
        startNodeId: 'q1',
      };
      const workflowVersion = {
        id: 'test-version',
        graphJson: graph,
      } as WorkflowVersion;
      const input: RunGraphInput = {
        workflowVersion,
        inputJson: {
          q1: false, // Answer for q1 (by node ID)
          q3: 1000,  // Answer for q3 (by node ID)
        },
        tenantId: 'test-tenant',
        options: { debug: true, clock: fixedClock },
      };
      const result = await runGraph(input);
      expect(result.status).toBe('success');
      expect(result.trace).toBeDefined();
      // q2 should be skipped
      const q2Trace = result.trace?.find(t => t.nodeId === 'q2');
      // c1 should be executed
      const c1Trace = result.trace?.find(t => t.nodeId === 'c1');
      expect(c1Trace?.status).toBe('executed');
      expect(c1Trace?.outputsDelta?.total).toBe(1082.5);
      // t1 should be executed
      const t1Trace = result.trace?.find(t => t.nodeId === 't1');
      expect(t1Trace?.status).toBe('executed');
      // Check logs
      const logs = result.logs;
      expect(logs.some(l => l.message.includes('Skipped node q2'))).toBe(true);
      expect(logs.some(l => l.message.includes('Executed node c1'))).toBe(true);
      expect(logs.some(l => l.message.includes('Executed node t1'))).toBe(true);
    });
  });
  describe('Debug Mode', () => {
    it('should return trace when debug is enabled', async () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'name',
              questionText: 'Name?',
              questionType: 'text',
            },
          },
        ],
        startNodeId: 'q1',
      };
      const workflowVersion = {
        id: 'test-version',
        graphJson: graph,
      } as WorkflowVersion;
      const input: RunGraphInput = {
        workflowVersion,
        inputJson: { q1: 'John' },
        tenantId: 'test-tenant',
        options: { debug: true },
      };
      const result = await runGraph(input);
      expect(result.status).toBe('success');
      expect(result.trace).toBeDefined();
      expect(result.trace?.length).toBeGreaterThan(0);
    });
    it('should not return trace when debug is disabled', async () => {
      const graph: GraphJson = {
        nodes: [
          {
            id: 'q1',
            type: 'question',
            config: {
              key: 'name',
              questionText: 'Name?',
              questionType: 'text',
            },
          },
        ],
        startNodeId: 'q1',
      };
      const workflowVersion = {
        id: 'test-version',
        graphJson: graph,
      } as WorkflowVersion;
      const input: RunGraphInput = {
        workflowVersion,
        inputJson: { q1: 'John' },
        tenantId: 'test-tenant',
        options: { debug: false },
      };
      const result = await runGraph(input);
      expect(result.status).toBe('success');
      expect(result.trace).toBeUndefined();
    });
  });
});