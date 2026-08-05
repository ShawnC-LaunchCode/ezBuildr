import crypto from 'crypto';

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import type { RunDocumentDelivery, WorkflowRun } from '@shared/schema';

import { cloudStorageDeliveryAdapter } from '../../../../../server/services/document/delivery/adapters/CloudStorageDeliveryAdapter';
import { emailDeliveryAdapter } from '../../../../../server/services/document/delivery/adapters/EmailDeliveryAdapter';
import type { DeliveryAdapterContext } from '../../../../../server/services/document/delivery/adapters/IDeliveryAdapter';
import { webhookDeliveryAdapter } from '../../../../../server/services/document/delivery/adapters/WebhookDeliveryAdapter';
import { emailQueueService } from '../../../../../server/services/EmailQueueService';
import { storageProvider } from '../../../../../server/services/storage';
import { encrypt } from '../../../../../server/utils/encryption';
import * as safeFetchModule from '../../../../../server/utils/safeFetch';
import * as ssrfValidatorModule from '../../../../../server/utils/ssrfValidator';

const mockSend = vi.fn().mockResolvedValue({});
let capturedS3Config: Record<string, unknown> | null = null;
let capturedPutCommands: Array<{ input: unknown }> = [];

vi.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    constructor(config: Record<string, unknown>) {
      capturedS3Config = config;
    }
    send = mockSend;
    destroy = vi.fn();
  }
  class MockPutObjectCommand {
    constructor(public input: unknown) {
      capturedPutCommands.push({ input });
    }
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
  };
});

vi.mock('../../../../../server/services/EmailQueueService', () => ({
  emailQueueService: {
    sendNow: vi.fn(),
  },
}));

vi.mock('../../../../../server/services/storage', () => ({
  storageProvider: {
    getFile: vi.fn(),
    getSignedUrl: vi.fn(),
  },
}));

describe('Document Delivery Adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedS3Config = null;
    capturedPutCommands = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockRun = {
    id: 'run-123',
    workflowId: 'wf-456',
    ownerType: 'user',
    ownerUuid: 'user-001',
    workflowVersionId: null,
    runToken: 'token-123',
    tokenExpiresAt: null,
    createdBy: 'user-001',
    currentSectionId: null,
    progress: 100,
    completed: true,
    completedAt: new Date(),
    generationStatus: 'done',
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    clientEmail: null,
    portalAccessKey: null,
    accessMode: 'anonymous' as const,
    shareTokenHash: null,
    shareTokenExpiresAt: null,
  } as unknown as WorkflowRun;

  const mockDocuments = [
    {
      fileName: 'Agreement.pdf',
      storageKey: 'storage/Agreement.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      fileUrl: 'https://storage.ezbuildr.com/Agreement.pdf',
    },
  ];

  describe('EmailDeliveryAdapter', () => {
    it('should send interpolated email with generated documents attached', async () => {
      vi.mocked(emailQueueService.sendNow).mockResolvedValue();
      vi.mocked(storageProvider.getFile).mockResolvedValue(Buffer.from('PDF Content'));

      const mockDelivery: RunDocumentDelivery = {
        id: 'delivery-1',
        runId: 'run-123',
        workflowId: 'wf-456',
        tenantId: 'tenant-789',
        destinationType: 'email',
        destinationConfig: {
          to: '{{client_email}}',
          subject: 'Your agreement {{contract_number}} is ready',
          body: 'Hello {{client_name}}, your agreement is generated.',
        },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        lastAttemptAt: null,
        deliveredAt: null,
        lastError: null,
        auditLog: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const context: DeliveryAdapterContext = {
        delivery: mockDelivery,
        documents: mockDocuments,
        stepValues: {
          client_email: 'client@example.com',
          contract_number: 'CNT-2026',
          client_name: 'Jane Doe',
        },
        workflowRun: mockRun,
      };

      const result = await emailDeliveryAdapter.deliver(context);

      expect(result.success).toBe(true);
      expect(emailQueueService.sendNow).toHaveBeenCalledWith(
        'client@example.com',
        'Your agreement CNT-2026 is ready',
        expect.stringContaining('Jane Doe'),
        [{
          content: Buffer.from('PDF Content').toString('base64'),
          filename: 'Agreement.pdf',
          type: 'application/pdf',
          disposition: 'attachment',
        }]
      );
      expect(result.metadata).toMatchObject({ provider: 'sendgrid', attachmentCount: 1 });
    });

    it('should report failure when SendGrid rejects the message', async () => {
      vi.mocked(emailQueueService.sendNow).mockRejectedValue(new Error('SendGrid unavailable'));
      vi.mocked(storageProvider.getFile).mockResolvedValue(Buffer.from('PDF Content'));

      const context: DeliveryAdapterContext = {
        delivery: {
          id: 'delivery-email-failure',
          runId: 'run-123',
          workflowId: 'wf-456',
          tenantId: 'tenant-789',
          destinationType: 'email',
          destinationConfig: { to: 'client@example.com' },
          status: 'pending',
          attempts: 0,
          maxAttempts: 5,
          nextAttemptAt: new Date(),
          lastAttemptAt: null,
          deliveredAt: null,
          lastError: null,
          auditLog: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        documents: mockDocuments,
        stepValues: {},
        workflowRun: mockRun,
      };

      const result = await emailDeliveryAdapter.deliver(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('SendGrid unavailable');
    });

    it('should fail gracefully if recipient email is invalid', async () => {
      const mockDelivery: RunDocumentDelivery = {
        id: 'delivery-2',
        runId: 'run-123',
        workflowId: 'wf-456',
        tenantId: 'tenant-789',
        destinationType: 'email',
        destinationConfig: {
          to: 'not-an-email',
          subject: 'Test',
        },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        lastAttemptAt: null,
        deliveredAt: null,
        lastError: null,
        auditLog: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const context: DeliveryAdapterContext = {
        delivery: mockDelivery,
        documents: mockDocuments,
        stepValues: {},
        workflowRun: mockRun,
      };

      const result = await emailDeliveryAdapter.deliver(context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid recipient email address');
      expect(emailQueueService.sendNow).not.toHaveBeenCalled();
    });
  });

  describe('WebhookDeliveryAdapter', () => {
    it('should decrypt encrypted secret, send payload with HMAC signature and handle success response', async () => {
      const safeFetchSpy = vi.spyOn(safeFetchModule, 'safeFetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('{"received": true}'),
      } as unknown as Response);

      const plaintextSecret = 'super-secret-key';
      const encryptedSecret = encrypt(plaintextSecret);

      const mockDelivery: RunDocumentDelivery = {
        id: 'delivery-3',
        runId: 'run-123',
        workflowId: 'wf-456',
        tenantId: 'tenant-789',
        destinationType: 'webhook',
        destinationConfig: {
          url: 'https://api.example.com/webhook',
          secret: encryptedSecret,
          headers: { 'X-Custom-Header': encrypt('CustomValue') },
        },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        lastAttemptAt: null,
        deliveredAt: null,
        lastError: null,
        auditLog: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const context: DeliveryAdapterContext = {
        delivery: mockDelivery,
        documents: mockDocuments,
        stepValues: { status: 'approved' },
        workflowRun: mockRun,
      };

      const result = await webhookDeliveryAdapter.deliver(context);

      expect(result.success).toBe(true);
      expect(result.responseCode).toBe(200);
      expect(safeFetchSpy).toHaveBeenCalledTimes(1);

      const [url, init] = safeFetchSpy.mock.calls[0];
      expect(url).toBe('https://api.example.com/webhook');
      expect(init?.headers).toHaveProperty('X-Custom-Header', 'CustomValue');
      expect(init?.headers).toHaveProperty('X-EZBuildr-Signature');

      const signature = (init?.headers as Record<string, string>)['X-EZBuildr-Signature'];
      const body = init?.body as string;
      const expectedHmac = crypto.createHmac('sha256', plaintextSecret).update(body).digest('hex');
      expect(signature).toBe(`sha256=${expectedHmac}`);
    });

    it('should handle non-2xx HTTP responses as failure', async () => {
      vi.spyOn(safeFetchModule, 'safeFetch').mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: () => Promise.resolve('Bad Gateway Error from proxy'),
      } as unknown as Response);

      const mockDelivery: RunDocumentDelivery = {
        id: 'delivery-4',
        runId: 'run-123',
        workflowId: 'wf-456',
        tenantId: 'tenant-789',
        destinationType: 'webhook',
        destinationConfig: {
          url: 'https://api.example.com/webhook',
        },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        lastAttemptAt: null,
        deliveredAt: null,
        lastError: null,
        auditLog: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const context: DeliveryAdapterContext = {
        delivery: mockDelivery,
        documents: mockDocuments,
        stepValues: {},
        workflowRun: mockRun,
      };

      const result = await webhookDeliveryAdapter.deliver(context);
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe(502);
      expect(result.error).toContain('Webhook returned HTTP 502');
    });
  });

  describe('CloudStorageDeliveryAdapter', () => {
    it('should decrypt credentials, sanitize paths, and upload document files to target S3 bucket', async () => {
      vi.mocked(storageProvider.getFile).mockResolvedValue(Buffer.from('PDF Content'));

      const plainSecretKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      const plainAccessKey = 'AKIAIOSFODNN7EXAMPLE';

      const mockDelivery: RunDocumentDelivery = {
        id: 'delivery-5',
        runId: 'run-123',
        workflowId: 'wf-456',
        tenantId: 'tenant-789',
        destinationType: 'cloud_storage',
        destinationConfig: {
          bucket: 'customer-output-bucket',
          pathPrefix: 'runs/../2026/../../secret/',
          accessKeyId: encrypt(plainAccessKey),
          secretAccessKey: encrypt(plainSecretKey),
          region: 'us-west-2',
        },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        lastAttemptAt: null,
        deliveredAt: null,
        lastError: null,
        auditLog: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const context: DeliveryAdapterContext = {
        delivery: mockDelivery,
        documents: [
          {
            fileName: '../../../etc/Agreement.pdf',
            storageKey: 'storage/Agreement.pdf',
            mimeType: 'application/pdf',
            fileSize: 1024,
            fileUrl: 'https://storage.ezbuildr.com/Agreement.pdf',
          },
        ],
        stepValues: {},
        workflowRun: mockRun,
      };

      const result = await cloudStorageDeliveryAdapter.deliver(context);
      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('bucket', 'customer-output-bucket');
      expect(storageProvider.getFile).toHaveBeenCalledWith('storage/Agreement.pdf');

      // Verify decrypted credentials were passed to S3Client
      expect(capturedS3Config).not.toBeNull();
      expect(capturedS3Config?.region).toBe('us-west-2');
      const creds = capturedS3Config?.credentials as { accessKeyId: string; secretAccessKey: string };
      expect(creds.accessKeyId).toBe(plainAccessKey);
      expect(creds.secretAccessKey).toBe(plainSecretKey);

      // Verify sanitized path in PutObjectCommand (no .. traversal)
      expect(capturedPutCommands).toHaveLength(1);
      const putInput = capturedPutCommands[0].input as { Bucket: string; Key: string };
      expect(putInput.Bucket).toBe('customer-output-bucket');
      expect(putInput.Key).toBe('runs/2026/secret/Agreement.pdf');
    });

    it('should reject unsafe endpoint URLs to prevent SSRF', async () => {
      const mockDelivery: RunDocumentDelivery = {
        id: 'delivery-6',
        runId: 'run-123',
        workflowId: 'wf-456',
        tenantId: 'tenant-789',
        destinationType: 'cloud_storage',
        destinationConfig: {
          bucket: 'customer-output-bucket',
          endpoint: 'https://169.254.169.254/latest/meta-data/',
        },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        lastAttemptAt: null,
        deliveredAt: null,
        lastError: null,
        auditLog: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const context: DeliveryAdapterContext = {
        delivery: mockDelivery,
        documents: mockDocuments,
        stepValues: {},
        workflowRun: mockRun,
      };

      const result = await cloudStorageDeliveryAdapter.deliver(context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('SSRF Prevention: Cloud storage endpoint');
    });

    it('should reject plaintext HTTP cloud endpoints even when publicly routable', async () => {
      const context: DeliveryAdapterContext = {
        delivery: {
          id: 'delivery-http',
          runId: 'run-123',
          workflowId: 'wf-456',
          tenantId: 'tenant-789',
          destinationType: 'cloud_storage',
          destinationConfig: {
            bucket: 'customer-output-bucket',
            endpoint: 'http://example.com',
          },
          status: 'pending',
          attempts: 0,
          maxAttempts: 5,
          nextAttemptAt: new Date(),
          lastAttemptAt: null,
          deliveredAt: null,
          lastError: null,
          auditLog: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        documents: mockDocuments,
        stepValues: {},
        workflowRun: mockRun,
      };

      const result = await cloudStorageDeliveryAdapter.deliver(context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('SSRF Prevention: Cloud storage endpoint');
    });

    it('should pin a validated custom HTTPS endpoint in the S3 request handler', async () => {
      vi.spyOn(ssrfValidatorModule, 'resolveSafeUrl').mockResolvedValue({
        address: '93.184.216.34',
        family: 4,
        parsed: new URL('https://objects.example.com'),
      });
      vi.mocked(storageProvider.getFile).mockResolvedValue(Buffer.from('PDF Content'));

      const context: DeliveryAdapterContext = {
        delivery: {
          id: 'delivery-pinned',
          runId: 'run-123',
          workflowId: 'wf-456',
          tenantId: 'tenant-789',
          destinationType: 'cloud_storage',
          destinationConfig: {
            bucket: 'customer-output-bucket',
            endpoint: 'https://objects.example.com',
          },
          status: 'pending',
          attempts: 0,
          maxAttempts: 5,
          nextAttemptAt: new Date(),
          lastAttemptAt: null,
          deliveredAt: null,
          lastError: null,
          auditLog: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        documents: mockDocuments,
        stepValues: {},
        workflowRun: mockRun,
      };

      const result = await cloudStorageDeliveryAdapter.deliver(context);
      expect(result.success).toBe(true);
      expect(capturedS3Config?.endpoint).toBe('https://objects.example.com');
      expect(capturedS3Config?.requestHandler).toBeDefined();
    });
  });
});
