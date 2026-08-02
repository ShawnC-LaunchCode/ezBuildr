/**
 * DataVault Row Archive Routes - Route Ordering Regression Tests
 *
 * Regression: the literal /rows/bulk/* routes must be registered BEFORE the
 * parameterized /rows/:rowId/* routes. Express matches routes in registration
 * order, so with the old ordering a request to PATCH /rows/bulk/archive was
 * captured by /rows/:rowId/archive with rowId='bulk', which then failed with
 * an invalid-uuid error inside datavaultRowsService.getRow('bulk', tenantId).
 *
 * These tests exercise the real Express routing (via supertest) with mocked
 * auth and services, so they fail if the registration order regresses.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, vi, type Mock } from 'vitest';

import { registerDatavaultRoutes } from '../../../server/routes/datavault.routes';
import {
  datavaultRowsService,
  datavaultTablesService,
} from '../../../server/services';

const TEST_TENANT_ID = 'tenant-1';
const TEST_USER_ID = 'user-1';
const ROW_ID_1 = '11111111-1111-4111-8111-111111111111';
const ROW_ID_2 = '22222222-2222-4222-8222-222222222222';
const TABLE_ID = '33333333-3333-4333-8333-333333333333';

// Pass-through auth: plain functions (not vi.fn) so vi.restoreAllMocks()
// in the global afterEach cannot wipe their implementations.
vi.mock('../../../server/middleware/auth', () => ({
  hybridAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  optionalHybridAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuthUserId: () => 'user-1',
  getAuthUserTenantId: () => 'tenant-1',
}));

vi.mock('../../../server/middleware/runTokenAuth', () => ({
  creatorOrRunTokenAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../../server/middleware/rateLimiter', () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    apiLimiter: passThrough,
    batchLimiter: passThrough,
    createLimiter: passThrough,
    deleteLimiter: passThrough,
    strictLimiter: passThrough,
  };
});

vi.mock('../../../server/services', () => ({
  datavaultTablesService: {
    requirePermission: vi.fn(),
  },
  datavaultColumnsService: {},
  datavaultRowsService: {
    getRow: vi.fn(),
    archiveRow: vi.fn(),
    unarchiveRow: vi.fn(),
    bulkArchiveRows: vi.fn(),
    bulkUnarchiveRows: vi.fn(),
    bulkDeleteRows: vi.fn(),
  },
  datavaultRowNotesService: {},
  datavaultTablePermissionsService: {},
}));

vi.mock('../../../server/services/AclService', () => ({
  aclService: {},
}));

vi.mock('../../../server/services/DatavaultDatabasesService', () => ({
  datavaultDatabasesService: {},
}));

vi.mock('../../../server/logger', () => ({
  logger: {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
}));

interface MockedRowsService {
  getRow: Mock;
  archiveRow: Mock;
  unarchiveRow: Mock;
  bulkArchiveRows: Mock;
  bulkUnarchiveRows: Mock;
  bulkDeleteRows: Mock;
}

const rowsService = datavaultRowsService as unknown as MockedRowsService;
const tablesService = datavaultTablesService as unknown as { requirePermission: Mock };

describe('DataVault Row Archive Routes - bulk vs :rowId ordering', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    registerDatavaultRoutes(app);
  });

  beforeEach(() => {
    // Implementations are (re)set here because the global afterEach in
    // tests/setup-fast.ts calls vi.restoreAllMocks(), which wipes them.
    rowsService.getRow.mockResolvedValue({ row: { id: ROW_ID_1, tableId: TABLE_ID } });
    rowsService.archiveRow.mockResolvedValue(undefined);
    rowsService.unarchiveRow.mockResolvedValue(undefined);
    rowsService.bulkArchiveRows.mockResolvedValue(undefined);
    rowsService.bulkUnarchiveRows.mockResolvedValue(undefined);
    rowsService.bulkDeleteRows.mockResolvedValue(undefined);
    tablesService.requirePermission.mockResolvedValue(undefined);
  });

  describe('PATCH /api/datavault/rows/bulk/archive', () => {
    it('reaches the bulk handler instead of the :rowId handler', async () => {
      const response = await request(app)
        .patch('/api/datavault/rows/bulk/archive')
        .send({ rowIds: [ROW_ID_1, ROW_ID_2] })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '2 row(s) archived successfully',
        count: 2,
      });
      expect(rowsService.bulkArchiveRows).toHaveBeenCalledWith(TEST_TENANT_ID, [ROW_ID_1, ROW_ID_2]);
      expect(rowsService.archiveRow).not.toHaveBeenCalled();
      // The regression symptom: the :rowId handler captured 'bulk' as a rowId
      expect(rowsService.getRow).not.toHaveBeenCalledWith('bulk', expect.anything());
    });

    it('checks write permission against the first row table', async () => {
      await request(app)
        .patch('/api/datavault/rows/bulk/archive')
        .send({ rowIds: [ROW_ID_1] })
        .expect(200);

      expect(rowsService.getRow).toHaveBeenCalledWith(ROW_ID_1, TEST_TENANT_ID);
      expect(tablesService.requirePermission).toHaveBeenCalledWith(
        TEST_USER_ID,
        TABLE_ID,
        TEST_TENANT_ID,
        'write'
      );
    });

    it('returns 400 for an empty rowIds array', async () => {
      const response = await request(app)
        .patch('/api/datavault/rows/bulk/archive')
        .send({ rowIds: [] })
        .expect(400);

      expect(response.body.message).toBe('Invalid input');
      expect(rowsService.bulkArchiveRows).not.toHaveBeenCalled();
    });

    it('returns 400 for non-uuid rowIds', async () => {
      await request(app)
        .patch('/api/datavault/rows/bulk/archive')
        .send({ rowIds: ['not-a-uuid'] })
        .expect(400);

      expect(rowsService.bulkArchiveRows).not.toHaveBeenCalled();
    });

    it('returns 404 when the first row does not exist', async () => {
      rowsService.getRow.mockResolvedValue(null);

      await request(app)
        .patch('/api/datavault/rows/bulk/archive')
        .send({ rowIds: [ROW_ID_1] })
        .expect(404);

      expect(rowsService.bulkArchiveRows).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/datavault/rows/bulk/unarchive', () => {
    it('reaches the bulk handler instead of the :rowId handler', async () => {
      const response = await request(app)
        .patch('/api/datavault/rows/bulk/unarchive')
        .send({ rowIds: [ROW_ID_1, ROW_ID_2] })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '2 row(s) unarchived successfully',
        count: 2,
      });
      expect(rowsService.bulkUnarchiveRows).toHaveBeenCalledWith(TEST_TENANT_ID, [ROW_ID_1, ROW_ID_2]);
      expect(rowsService.unarchiveRow).not.toHaveBeenCalled();
      expect(rowsService.getRow).not.toHaveBeenCalledWith('bulk', expect.anything());
    });

    it('returns 400 for invalid input', async () => {
      await request(app)
        .patch('/api/datavault/rows/bulk/unarchive')
        .send({})
        .expect(400);

      expect(rowsService.bulkUnarchiveRows).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/datavault/rows/bulk/delete', () => {
    it('bulk deletes rows', async () => {
      const response = await request(app)
        .delete('/api/datavault/rows/bulk/delete')
        .send({ rowIds: [ROW_ID_1, ROW_ID_2] })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '2 row(s) deleted successfully',
        count: 2,
      });
      expect(rowsService.bulkDeleteRows).toHaveBeenCalledWith([ROW_ID_1, ROW_ID_2], TEST_TENANT_ID);
    });

    it('returns 400 for an empty rowIds array', async () => {
      await request(app)
        .delete('/api/datavault/rows/bulk/delete')
        .send({ rowIds: [] })
        .expect(400);

      expect(rowsService.bulkDeleteRows).not.toHaveBeenCalled();
    });

    it('returns 404 when the first row does not exist', async () => {
      rowsService.getRow.mockResolvedValue(null);

      await request(app)
        .delete('/api/datavault/rows/bulk/delete')
        .send({ rowIds: [ROW_ID_1] })
        .expect(404);

      expect(rowsService.bulkDeleteRows).not.toHaveBeenCalled();
    });
  });

  describe('single-row routes still work after reordering', () => {
    it('PATCH /rows/:rowId/archive archives the row', async () => {
      const response = await request(app)
        .patch(`/api/datavault/rows/${ROW_ID_1}/archive`)
        .expect(200);

      expect(response.body).toEqual({ success: true, message: 'Row archived successfully' });
      expect(rowsService.getRow).toHaveBeenCalledWith(ROW_ID_1, TEST_TENANT_ID);
      expect(rowsService.archiveRow).toHaveBeenCalledWith(TEST_TENANT_ID, ROW_ID_1);
      expect(rowsService.bulkArchiveRows).not.toHaveBeenCalled();
    });

    it('PATCH /rows/:rowId/unarchive unarchives the row', async () => {
      const response = await request(app)
        .patch(`/api/datavault/rows/${ROW_ID_1}/unarchive`)
        .expect(200);

      expect(response.body).toEqual({ success: true, message: 'Row unarchived successfully' });
      expect(rowsService.unarchiveRow).toHaveBeenCalledWith(TEST_TENANT_ID, ROW_ID_1);
      expect(rowsService.bulkUnarchiveRows).not.toHaveBeenCalled();
    });

    it('PATCH /rows/:rowId/archive returns 404 for a missing row', async () => {
      rowsService.getRow.mockResolvedValue(null);

      await request(app)
        .patch(`/api/datavault/rows/${ROW_ID_1}/archive`)
        .expect(404);

      expect(rowsService.archiveRow).not.toHaveBeenCalled();
    });
  });
});
