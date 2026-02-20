import { describe, it, expect, vi, beforeEach, afterEach, type Mocked, type Mock } from 'vitest';

import { DatavaultColumnsService } from '../../../server/services/DatavaultColumnsService';
import {
    datavaultColumnsRepository,
    datavaultTablesRepository,
    datavaultRowsRepository,
} from "../../../server/repositories";
import { db } from '../../../server/db';
import type { DatavaultColumn, DatavaultTable } from "@shared/schema";

// Mock modules
vi.mock('../../../server/db', () => ({
    db: {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
    },
}));

describe('DatavaultGuardrails', () => {
    let service: DatavaultColumnsService;
    let mockColumnsRepo: Mocked<typeof datavaultColumnsRepository>;
    let mockTablesRepo: Mocked<typeof datavaultTablesRepository>;
    let mockRowsRepo: Mocked<typeof datavaultRowsRepository>;
    interface MockQueryBuilder {
        select: Mock;
        from: Mock;
        where: Mock;
        limit: Mock;
    }
    let mockQueryBuilder: MockQueryBuilder;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup generic DB mock chain
        // Use explicit mockReturnValue(builder) instead of mockReturnThis() to ensure
        // the chain always flows through mockQueryBuilder (not the db mock object).
        const builder: MockQueryBuilder = {
            select: vi.fn(),
            from: vi.fn(),
            where: vi.fn(),
            limit: vi.fn(),
        };
        builder.select.mockReturnValue(builder);
        builder.from.mockReturnValue(builder);
        builder.where.mockReturnValue(builder);
        builder.limit.mockResolvedValue([]); // Default: no matches
        mockQueryBuilder = builder;

        // Override db.select to enter the mockQueryBuilder chain
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        vi.mocked(db).select = vi.fn().mockReturnValue(mockQueryBuilder) as unknown as typeof db.select;

        mockColumnsRepo = {
            findById: vi.fn(),
            delete: vi.fn(),
            slugExists: vi.fn(),
            findByTableId: vi.fn(),
            getMaxOrderIndex: vi.fn(),
            create: vi.fn(),
            findByTableAndSlug: vi.fn(),
            reorderColumns: vi.fn(),
            update: vi.fn(),
        } as unknown as Mocked<typeof datavaultColumnsRepository>;

        mockTablesRepo = {
            findById: vi.fn(),
        } as unknown as Mocked<typeof datavaultTablesRepository>;

        mockRowsRepo = {
            deleteValuesByColumnId: vi.fn(),
            cleanupAutoNumberSequence: vi.fn(),
            checkColumnHasDuplicates: vi.fn(),
        } as unknown as Mocked<typeof datavaultRowsRepository>;

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
            } as unknown as DatavaultColumn);
            mockTablesRepo.findById.mockResolvedValue({
                id: 'table-1',
                tenantId: tenantId,
            } as unknown as DatavaultTable);

            // Mock DB query to find matching blocks
            // select -> from -> where -> limit -> [Promise]
            // First, mock the chain. db.select() returns builder.
            // The service calls: db.select(...).from(...).where(...).limit(1)
            // We need to ensure the LAST method in the chain returns the desired value.
            mockQueryBuilder.limit.mockResolvedValueOnce([{ id: 'block-1', type: 'create_record', workflowId: 'wf-1' }]);

            await expect(service.deleteColumn(columnId, tenantId)).rejects.toThrow(/referenced by a create_record block/);
        });

        it('should throw if column is referenced in a transform', async () => {
            const columnId = 'col-123';
            const tenantId = 'tenant-1';

            // Setup column
            mockColumnsRepo.findById.mockResolvedValue({ id: columnId, tableId: 'table-1', isPrimaryKey: false } as unknown as DatavaultColumn);
            mockTablesRepo.findById.mockResolvedValue({ id: 'table-1', tenantId: tenantId } as unknown as DatavaultTable);

            // First query (blocks) returns empty
            // First query (blocks) returns empty
            mockQueryBuilder.limit.mockResolvedValueOnce([]);

            // Second query (transforms) returns match
            // Second query (transforms) returns match
            mockQueryBuilder.limit.mockResolvedValueOnce([{ id: 'tf-1', name: 'My Transform', workflowId: 'wf-2' }]);

            await expect(service.deleteColumn(columnId, tenantId)).rejects.toThrow(/referenced by transform block/);
        });

        it('should succeed if no references found', async () => {
            const columnId = 'col-123';
            const tenantId = 'tenant-1';

            mockColumnsRepo.findById.mockResolvedValue({ id: columnId, tableId: 'table-1', isPrimaryKey: false } as unknown as DatavaultColumn);
            mockTablesRepo.findById.mockResolvedValue({ id: 'table-1', tenantId: tenantId } as unknown as DatavaultTable);

            // No matches
            // No matches
            mockQueryBuilder.limit.mockResolvedValue([]);

            await service.deleteColumn(columnId, tenantId);

            expect(mockColumnsRepo.delete).toHaveBeenCalledWith(columnId, undefined);
        });
    });
});
