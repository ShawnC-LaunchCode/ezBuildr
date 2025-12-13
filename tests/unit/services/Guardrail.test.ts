import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatavaultColumnsService } from '../../../server/services/DatavaultColumnsService';

// Mock modules
vi.mock('../../../server/db', () => ({
    db: {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
    },
}));

vi.mock('../../../server/repositories', () => ({
    datavaultColumnsRepository: {},
    datavaultTablesRepository: {},
    datavaultRowsRepository: {},
}));

import { db } from '../../../server/db';
const mockDb = db as any;

vi.mock('@shared/schema', () => ({
    blocks: { id: 'blocks_id', type: 'blocks_type', workflowId: 'blocks_wf', config: 'blocks_config' },
    transformBlocks: { id: 'tb_id', name: 'tb_name', workflowId: 'tb_wf', code: 'tb_code', inputKeys: 'tb_input' },
    datavaultColumns: { id: 'col_id', tableId: 'table_id' },
}));

describe('DatavaultGuardrails', () => {
    let service: DatavaultColumnsService;
    let mockColumnsRepo: any;
    let mockTablesRepo: any;
    let mockRowsRepo: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup generic DB mock chain
        const mockQueryBuilder = {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
        };

        // Apply to the imported db object (which is a singleton mock)
        mockDb.select = mockQueryBuilder.select;
        mockDb.from = mockQueryBuilder.from;
        mockDb.where = mockQueryBuilder.where;
        mockDb.limit = mockQueryBuilder.limit;

        mockColumnsRepo = {
            findById: vi.fn(),
            delete: vi.fn(),
        };
        mockTablesRepo = {
            findById: vi.fn(),
        };
        mockRowsRepo = {
            deleteValuesByColumnId: vi.fn(),
            cleanupAutoNumberSequence: vi.fn(),
        };

        service = new DatavaultColumnsService(mockColumnsRepo, mockTablesRepo, mockRowsRepo);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('deleteColumn', () => {
        it('should throw if column is referenced in a block', async () => {
            const columnId = 'col-123';
            const tenantId = 'tenant-1';

            // Setup column existence
            mockColumnsRepo.findById.mockResolvedValue({
                id: columnId,
                tableId: 'table-1',
                isPrimaryKey: false,
            });
            mockTablesRepo.findById.mockResolvedValue({
                id: 'table-1',
                tenantId: tenantId,
            });

            // Mock DB query to find matching blocks
            // select -> from -> where -> limit -> [Promise]
            mockDb.limit.mockResolvedValueOnce([{ id: 'block-1', type: 'create_record', workflowId: 'wf-1' }]);

            await expect(service.deleteColumn(columnId, tenantId)).rejects.toThrow(/referenced by a create_record block/);
        });

        it('should throw if column is referenced in a transform', async () => {
            const columnId = 'col-123';
            const tenantId = 'tenant-1';

            // Setup column
            mockColumnsRepo.findById.mockResolvedValue({ id: columnId, tableId: 'table-1', isPrimaryKey: false });
            mockTablesRepo.findById.mockResolvedValue({ id: 'table-1', tenantId: tenantId });

            // First query (blocks) returns empty
            mockDb.limit.mockResolvedValueOnce([]);

            // Second query (transforms) returns match
            mockDb.limit.mockResolvedValueOnce([{ id: 'tf-1', name: 'My Transform', workflowId: 'wf-2' }]);

            await expect(service.deleteColumn(columnId, tenantId)).rejects.toThrow(/referenced by transform block/);
        });

        it('should succeed if no references found', async () => {
            const columnId = 'col-123';
            const tenantId = 'tenant-1';

            mockColumnsRepo.findById.mockResolvedValue({ id: columnId, tableId: 'table-1', isPrimaryKey: false });
            mockTablesRepo.findById.mockResolvedValue({ id: 'table-1', tenantId: tenantId });

            // No matches
            mockDb.limit.mockResolvedValue([]);

            await service.deleteColumn(columnId, tenantId);

            expect(mockColumnsRepo.delete).toHaveBeenCalledWith(columnId, undefined);
        });
    });
});
