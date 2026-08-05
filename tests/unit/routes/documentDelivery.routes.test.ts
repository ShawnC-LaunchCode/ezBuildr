import express, { type Express } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

import { registerDocumentDeliveryRoutes } from '../../../server/routes/documentDelivery.routes';
import { documentDeliveryService } from '../../../server/services/document/delivery/DocumentDeliveryService';

const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const RUN_ID = '33333333-3333-3333-3333-333333333333';
const DELIVERY_ID = '44444444-4444-4444-4444-444444444444';

vi.mock('../../../server/middleware/auth', () => ({
  hybridAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  optionalHybridAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuthUserId: () => 'user-1',
  getAuthUserTenantId: () => TEST_TENANT_ID,
}));

vi.mock('../../../server/middleware/tenant', () => ({
  validateTenantParam: (req: express.Request, res: express.Response, next: () => void) => {
    // If tenantId in param does not match auth tenant, return 403
    if (req.params.tenantId && req.params.tenantId !== TEST_TENANT_ID) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  },
  requireTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  getTenantId: () => TEST_TENANT_ID,
}));

vi.mock('../../../server/services/document/delivery/DocumentDeliveryService', async () => {
  const actual = await vi.importActual('../../../server/services/document/delivery/DocumentDeliveryService');
  return {
    ...actual,
    documentDeliveryService: {
      listDeliveriesForRun: vi.fn(),
      getDeliveryForTenant: vi.fn(),
      retryDelivery: vi.fn(),
    },
  };
});

describe('Document Delivery Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    registerDocumentDeliveryRoutes(app);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/tenants/:tenantId/runs/:runId/deliveries', () => {
    it('should return 403 when requesting for a different tenant in params', async () => {
      const res = await request(app).get(`/api/tenants/${OTHER_TENANT_ID}/runs/${RUN_ID}/deliveries`);
      expect(res.status).toBe(403);
    });

    it('should return 404 when workflow run is not found', async () => {
      vi.mocked(documentDeliveryService.listDeliveriesForRun).mockRejectedValue(
        new Error('Workflow run not found')
      );

      const res = await request(app).get(`/api/tenants/${TEST_TENANT_ID}/runs/${RUN_ID}/deliveries`);
      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should return 403 when run belongs to a different tenant', async () => {
      vi.mocked(documentDeliveryService.listDeliveriesForRun).mockRejectedValue(
        new Error('Access denied - workflow run belongs to different tenant')
      );

      const res = await request(app).get(`/api/tenants/${TEST_TENANT_ID}/runs/${RUN_ID}/deliveries`);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should return list of deliveries with secrets redacted', async () => {
      const mockDeliveries = [
        {
          id: DELIVERY_ID,
          runId: RUN_ID,
          tenantId: TEST_TENANT_ID,
          destinationType: 'webhook',
          destinationConfig: {
            url: 'https://example.com/webhook',
            secret: 'v1.supersecretcipher',
          },
          status: 'delivered',
        },
        {
          id: '55555555-5555-5555-5555-555555555555',
          runId: RUN_ID,
          tenantId: TEST_TENANT_ID,
          destinationType: 'cloud_storage',
          destinationConfig: {
            bucket: 'my-bucket',
            accessKeyId: 'AKIA1234567890',
            secretAccessKey: 'v1.encryptedsecretkey',
          },
          status: 'pending',
        },
      ];
      vi.mocked(documentDeliveryService.listDeliveriesForRun).mockResolvedValue(mockDeliveries as never);

      const res = await request(app).get(`/api/tenants/${TEST_TENANT_ID}/runs/${RUN_ID}/deliveries`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].destinationConfig.secret).toBeUndefined();
      expect(res.body[1].destinationConfig.secretAccessKey).toBeUndefined();
      expect(res.body[1].destinationConfig.accessKeyId).toBeUndefined();
      expect(documentDeliveryService.listDeliveriesForRun).toHaveBeenCalledWith(RUN_ID, TEST_TENANT_ID);
    });
  });

  describe('GET /api/tenants/:tenantId/deliveries/:deliveryId', () => {
    it('should return 404 if delivery not found', async () => {
      vi.mocked(documentDeliveryService.getDeliveryForTenant).mockRejectedValue(
        new Error('Document delivery not found')
      );

      const res = await request(app).get(`/api/tenants/${TEST_TENANT_ID}/deliveries/${DELIVERY_ID}`);
      expect(res.status).toBe(404);
    });

    it('should return delivery record with audit trail and redacted secrets', async () => {
      const mockDelivery = {
        id: DELIVERY_ID,
        tenantId: TEST_TENANT_ID,
        destinationType: 'webhook',
        destinationConfig: {
          url: 'https://example.com/webhook',
          secret: 'v1.supersecretcipher',
        },
        status: 'delivered',
        auditLog: [
          {
            timestamp: '2026-08-04T00:00:00.000Z',
            attempt: 1,
            status: 'delivered',
          },
        ],
      };
      vi.mocked(documentDeliveryService.getDeliveryForTenant).mockResolvedValue(mockDelivery as never);

      const res = await request(app).get(`/api/tenants/${TEST_TENANT_ID}/deliveries/${DELIVERY_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(DELIVERY_ID);
      expect(res.body.auditLog).toHaveLength(1);
      expect(res.body.destinationConfig.secret).toBeUndefined();
    });
  });

  describe('POST /api/tenants/:tenantId/deliveries/:deliveryId/retry', () => {
    it('should return 404 if delivery does not belong to tenant', async () => {
      vi.mocked(documentDeliveryService.retryDelivery).mockRejectedValue(
        new Error('Document delivery not found')
      );

      const res = await request(app).post(`/api/tenants/${TEST_TENANT_ID}/deliveries/${DELIVERY_ID}/retry`);
      expect(res.status).toBe(404);
    });

    it('should trigger retry and return updated record with secrets redacted', async () => {
      const updatedDelivery = {
        id: DELIVERY_ID,
        tenantId: TEST_TENANT_ID,
        destinationConfig: {
          url: 'https://example.com/webhook',
          secret: 'v1.supersecretcipher',
        },
        status: 'pending',
        attempts: 0,
      };
      vi.mocked(documentDeliveryService.retryDelivery).mockResolvedValue(updatedDelivery as never);

      const res = await request(app).post(`/api/tenants/${TEST_TENANT_ID}/deliveries/${DELIVERY_ID}/retry`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('pending');
      expect(res.body.destinationConfig.secret).toBeUndefined();
      expect(documentDeliveryService.retryDelivery).toHaveBeenCalledWith(DELIVERY_ID, TEST_TENANT_ID);
    });
  });
});
