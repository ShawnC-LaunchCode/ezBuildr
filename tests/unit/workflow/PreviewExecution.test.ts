import { describe, it, expect, vi } from 'vitest';
import { runGraph } from '../../../server/engine/index';
import { datavaultRowsRepository } from '../../../server/repositories/DatavaultRowsRepository';
import { snapshotService } from '../../../server/services/snapshotService';

// Mock dependencies
vi.mock('../../../server/repositories/DatavaultRowsRepository');
vi.mock('../../../server/services/snapshotService');

describe('Preview Execution & Snapshots', () => {
    const mockRowsRepo = datavaultRowsRepository as any;
    const mockSnapshotSvc = snapshotService as any;

    const defaultInput = {
        workflowVersion: {
            id: 'v1',
            graphJson: {
                nodes: [
                    {
                        id: 'write1',
                        type: 'write',
                        config: {
                            operation: 'create',
                            tableId: 't1',
                            data: { name: '"Test"' },
                            outputKey: 'out1'
                        }
                    }
                ],
                edges: [],
                startNodeId: 'write1'
            }
        } as any,
        inputJson: {},
        tenantId: 'tenant1'
    };

    it('Preview mode should not call database write methods', async () => {
        // Setup mock for write node execution
        mockRowsRepo.createRowWithValues.mockResolvedValue('new-id');
        mockRowsRepo.getRowsWithValues.mockResolvedValue([]); // Ensure this is mocked

        const result = await runGraph({
            ...defaultInput,
            executionMode: 'preview', // <--- Key test param
            options: { debug: true } // Enable trace
        });

        expect(result.status).toBe('success');
        expect(mockRowsRepo.createRowWithValues).not.toHaveBeenCalled();

        // Validating sideEffects are captured
        const trace = result.trace || [];
        const writeTrace = trace.find(t => t.nodeId === 'write1');
        expect(writeTrace).toBeDefined();
        expect(writeTrace?.status).toBe('executed');
        expect(writeTrace?.sideEffects).toBeDefined();
        expect(writeTrace?.sideEffects?.operation).toBe('create');
    });

    it('Live mode SHOULD call database write methods', async () => {
        mockRowsRepo.createRowWithValues.mockResolvedValue({ row: { id: 'new-id' } } as any);

        const result = await runGraph({
            ...defaultInput,
            executionMode: 'live',
            options: { debug: true }
        });

        expect(result.status).toBe('success');
        expect(mockRowsRepo.createRowWithValues).toHaveBeenCalled();
    });

    it('Query node in preview should see shadow writes', async () => {
        // Test a graph with Write -> Query
        // The query should find the written value in memory
        // Note: runGraph integration doesn't persist `context.writes` between nodes inside runGraph unless passed explicitly or nodes share context.
        // The nodes DO share `context` which has `writes`.

        const graphJson = {
            nodes: [
                {
                    id: 'write1',
                    type: 'write',
                    config: {
                        operation: 'create',
                        tableId: 't1',
                        data: { name: '"Shadow"' },
                        outputKey: 'createdRow'
                    }
                },
                {
                    id: 'query1',
                    type: 'query',
                    config: {
                        tableId: 't1',
                        filters: [{ columnId: 'name', operator: 'eq', value: '"Shadow"' }],
                        outputKey: 'queryResult'
                    }
                }
            ],
            edges: [
                { source: 'write1', target: 'query1' }
            ],
            startNodeId: 'write1'
        };

        // Query node fetching live data: return empty
        mockRowsRepo.getRowsWithValues.mockResolvedValue([]); // Correct mock

        const result = await runGraph({
            workflowVersion: { id: 'v1', graphJson } as any,
            inputJson: {},
            tenantId: 'tenant1',
            executionMode: 'preview',
            options: { debug: true }
        });


        expect(result.status).toBe('success');

        // Check logs or context outputRefs (if exposed)
        const trace = result.trace!;
        const queryTrace = trace.find(t => t.nodeId === 'query1');
        expect(queryTrace).toBeDefined();

        // The query result should contain the shadow row
        const outputs = queryTrace?.outputsDelta?.queryResult;
        expect(outputs).toBeDefined();
        expect(outputs.length).toBe(1);
        expect(outputs[0].name).toBe('Shadow');
    });
});

