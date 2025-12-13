
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runGraph } from '../../../server/engine/index';
// Mocks need to be consistent with existing setups
vi.mock('../../../server/repositories/DatavaultRowsRepository', () => ({
    datavaultRowsRepository: {
        createRowWithValues: vi.fn(),
        getRowsWithValues: vi.fn(),
    },
}));

describe('Debug & Lineage', () => {
    const defaultInput = {
        workflowVersion: {
            id: 'v1',
            workflowId: 'wf1',
            graphJson: {
                nodes: [
                    {
                        id: 'q1',
                        type: 'question',
                        config: {
                            text: 'What is your name?',
                            key: 'userName',
                            type: 'text'
                        }
                    },
                    {
                        id: 'c1',
                        type: 'compute',
                        config: {
                            expression: 'concat("Hello ", userName)',
                            outputKey: 'greeting'
                        }
                    }
                ],
                edges: [{ source: 'q1', target: 'c1' }],
                startNodeId: 'q1'
            }
        } as any,
        inputJson: {
            q1: 'Alice'
            //  <-- Need to ensure inputJson actually populates userName in context.vars BEFORE c1 runs if it depends on it.
            // In runGraph logic:
            // context.vars = { ...inputJson, input: inputJson }
            // So userName should be there.
            // But why NaN?
            // expr-eval might need cleaner string concat syntax or userName is undefined.
            // Oh, 'q1' outputKey is 'userName'.
            // q1 executes. executeQuestionNode puts answer into context.
            // BUT inputJson is user ANSWERS mapping.
            // So if inputJson has { q1: 'Alice' }, executeQuestionNode for q1 should find 'Alice'.
            // AND map it to 'userName' var.
        },
        tenantId: 'tenant1',
        options: { debug: true }
    };
    // Wait, the inputJson key normally maps to the Question ID, not the Question KEY.
    // The Question Node config has 'key': 'userName'.
    // `executeQuestionNode` looks up `userInputs[node.id]`.
    // My inputJson above has `q1: 'Alice'`.
    // So context.vars['userName'] should be set to 'Alice'.

    // Issue might be `+` operator in expr-eval.
    // It usually supports string concat.
    // Let's try explicitly casting or using concat helper just to be safe,
    // OR simpler: just check if 'userName' is accessible.

    it('should generate execution trace with lineage', async () => {
        const result = await runGraph(defaultInput);

        // Debug output if it fails again
        if (result.status === 'success' && result.executionTrace?.steps[1]?.outputs?.greeting !== 'Hello Alice') {
            // console.log('Context vars at end:', result.executionTrace?.steps);
        }

        expect(result.status).toBe('success');
        expect(result.executionTrace).toBeDefined();

        const trace = result.executionTrace!;
        expect(trace.steps).toHaveLength(2);

        // Verify steps
        expect(trace.steps[0].blockId).toBe('q1');
        expect(trace.steps[0].outputs).toEqual({ userName: 'Alice' });

        expect(trace.steps[1].blockId).toBe('c1');
        expect(trace.steps[1].outputs).toEqual({ greeting: 'Hello Alice' }); // If this is still NaN, I'll fix the expression options.

        // Verify lineage
        expect(trace.variableLineage).toBeDefined();
        expect(trace.variableLineage['userName']).toBeDefined();
        expect(trace.variableLineage['userName'].sourceType).toBe('question');
        expect(trace.variableLineage['userName'].createdByBlockId).toBe('q1');

        expect(trace.variableLineage['greeting']).toBeDefined();
        expect(trace.variableLineage['greeting'].sourceType).toBe('compute');
        expect(trace.variableLineage['greeting'].createdByBlockId).toBe('c1');

        // Check timestamps (basic existence)
        expect(trace.startTime).toBeInstanceOf(Date);
        expect(trace.endTime).toBeInstanceOf(Date);
    });

    it('should track skipped blocks in trace', async () => {
        const inputWithSkip = {
            ...defaultInput,
            workflowVersion: {
                ...defaultInput.workflowVersion,
                graphJson: {
                    nodes: [
                        {
                            id: 'c1',
                            type: 'compute',
                            config: {
                                expression: '"Skip me"',
                                outputKey: 'skippedVar',
                                condition: 'false' // Always skip
                            }
                        }
                    ],
                    startNodeId: 'c1'
                }
            } as any
        };

        const result = await runGraph(inputWithSkip);

        expect(result.executionTrace).toBeDefined();
        const step = result.executionTrace!.steps[0];

        expect(step.status).toBe('skipped');
        expect(step.skippedReason).toBe('condition evaluated to false');
        expect(result.executionTrace!.variableLineage['skippedVar']).toBeUndefined();
    });
});
