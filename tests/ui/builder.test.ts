/**
 * Integration tests for Visual Workflow Builder - Simplified
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useBuilderStore } from '../../client/src/pages/visual-builder/store/useBuilderStore';

describe('Visual Workflow Builder Store', () => {
  beforeEach(() => {
    // Reset store before each test
    const store = useBuilderStore.getState();
    store.setNodes([]);
    store.setEdges([]);
    store.setDirty(false);
  });

  it('should add a question node', () => {
    useBuilderStore.getState().addNode('question', { x: 100, y: 100 });

    const store = useBuilderStore.getState();
    expect(store.nodes.length).toBe(1);
    expect(store.nodes[0].type).toBe('question');
    expect(store.nodes[0].data.config.key).toMatch(/^q_/);
  });

  it('should add a compute node', () => {
    useBuilderStore.getState().addNode('compute', { x: 200, y: 200 });

    const store = useBuilderStore.getState();
    expect(store.nodes.length).toBe(1);
    expect(store.nodes[0].type).toBe('compute');
    expect(store.nodes[0].data.config.outputKey).toMatch(/^c_/);
  });

  it('should export graph in correct format', () => {
    useBuilderStore.getState().addNode('question', { x: 100, y: 100 });
    useBuilderStore.getState().addNode('compute', { x: 200, y: 200 });

    const exported = useBuilderStore.getState().exportGraph();

    expect(exported).toHaveProperty('nodes');
    expect(exported).toHaveProperty('edges');
    expect(exported).toHaveProperty('startNodeId');
    expect(exported.nodes.length).toBe(2);
  });

  it('should load graph from API format', () => {
    const graphJson = {
      nodes: [
        {
          id: 'node1',
          type: 'question',
          config: { key: 'q1', label: 'Test Question', inputType: 'text' },
        },
      ],
      edges: [],
      startNodeId: 'node1',
    };

    useBuilderStore.getState().loadGraph(graphJson);

    const store = useBuilderStore.getState();
    expect(store.nodes.length).toBe(1);
    expect(store.nodes[0].id).toBe('node1');
    expect(store.nodes[0].type).toBe('question');
  });
});
