import { randomUUID } from 'crypto';

import { eq, sql } from 'drizzle-orm';
import { it, expect, beforeEach } from 'vitest';

import * as schema from '@shared/schema';
import type { DeliveryAuditLogEntry } from '@shared/types/delivery';

import { db } from '../../../../../server/db';
import { runDocumentDeliveryRepository, stepRepository } from '../../../../../server/repositories';
import type { DbTransaction } from '../../../../../server/repositories/BaseRepository';
import { documentDeliveryService } from '../../../../../server/services/document/delivery/DocumentDeliveryService';
import { decrypt } from '../../../../../server/utils/encryption';
import { describeWithDb } from '../../../../helpers/dbTestHelper';
import { TestFactory } from '../../../../helpers/testFactory';

describeWithDb('DocumentDelivery DB', () => {
  let testTenantId: string;
  let testWorkflowId: string;
  let testRunId: string;
  let testSectionId: string;

  beforeEach(async () => {
    await db.transaction(async (tx: unknown) => {
      const txFactory = new TestFactory(tx as DbTransaction);
      const { tenant, user, project } = await txFactory.createTenant();
      testTenantId = tenant.id;

      const { workflow, version } = await txFactory.createWorkflow(project.id, user.id, {
        workflow: {
          name: 'Delivery Test Workflow',
        },
      });
      testWorkflowId = workflow.id;
      const section = await txFactory.createSection(workflow.id);
      testSectionId = section.id;

      const [run] = await (tx as DbTransaction)
        .insert(schema.workflowRuns)
        .values({
          id: randomUUID(),
          workflowId: workflow.id,
          workflowVersionId: version.id,
          runToken: `token-${randomUUID()}`,
          createdBy: `creator:${user.id}`,
          ownerType: 'user',
          ownerUuid: user.id,
          completed: true,
          completedAt: new Date(),
        })
        .returning();

      testRunId = run.id;
    });
  });

  it('resolves a real user owner to its tenant before inserting the delivery FK', async () => {
    const created = await db.transaction(async (tx: DbTransaction) =>
      documentDeliveryService.enqueueDeliveriesForRun(testRunId, {
        markdownHeader: '',
        documents: [],
        deliveryDestinations: [{
          id: 'user-owned-email',
          type: 'email',
          config: { to: 'owner@example.com' },
        }],
      }, tx)
    );

    expect(created).toHaveLength(1);
    expect(created[0].tenantId).toBe(testTenantId);
  });

  it('installs the tenant-isolation RLS policy from the migration chain', async () => {
    const result = await db.execute(sql`
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = current_schema()
        AND tablename = 'run_document_deliveries'
        AND policyname = 'tenant_isolation'
    `);

    expect(result.rows).toHaveLength(1);
  });

  it('encrypts final-document credentials at the step persistence boundary', async () => {
    const step = await stepRepository.create({
      workflowId: testWorkflowId,
      sectionId: testSectionId,
      type: 'final_documents',
      title: 'Deliver documents',
      order: 1,
      config: {
        markdownHeader: '',
        documents: [],
        deliveryDestinations: [{
          id: 'secure-webhook',
          type: 'webhook',
          config: {
            url: 'https://example.com/hook',
            secret: 'plaintext-signing-secret',
            headers: { Authorization: 'Bearer plaintext-token' },
          },
        }],
      },
    });

    const [stored] = await db
      .select({ config: schema.steps.config })
      .from(schema.steps)
      .where(eq(schema.steps.id, step.id));
    const destination = (stored.config as {
      deliveryDestinations: Array<{ config: { secret: string; headers: Record<string, string> } }>;
    }).deliveryDestinations[0];

    expect(destination.config.secret).not.toContain('plaintext-signing-secret');
    expect(decrypt(destination.config.secret)).toBe('plaintext-signing-secret');
    expect(decrypt(destination.config.headers.Authorization)).toBe('Bearer plaintext-token');
  });

  it('successfully creates delivery record with tenantId and null tenantId without FK violation', async () => {
    const records = await runDocumentDeliveryRepository.createDeliveries([
      {
        runId: testRunId,
        workflowId: testWorkflowId,
        tenantId: testTenantId,
        destinationType: 'email',
        destinationConfig: { to: 'tenant@example.com' },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        auditLog: [],
      },
      {
        runId: testRunId,
        workflowId: testWorkflowId,
        tenantId: null, // User-owned / no tenant FK
        destinationType: 'webhook',
        destinationConfig: { url: 'https://example.com/webhook' },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        auditLog: [],
      },
    ]);

    expect(records).toHaveLength(2);
    expect(records[0].tenantId).toBe(testTenantId);
    expect(records[1].tenantId).toBeNull();
  });

  it('claims batch atomically with FOR UPDATE SKIP LOCKED', async () => {
    await runDocumentDeliveryRepository.createDeliveries([
      {
        runId: testRunId,
        workflowId: testWorkflowId,
        tenantId: testTenantId,
        destinationType: 'email',
        destinationConfig: { to: 'batch@example.com' },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(Date.now() - 1000), // Ready to claim
        auditLog: [],
      },
    ]);

    const claimed = await runDocumentDeliveryRepository.claimBatch({ limit: 10 });
    expect(claimed.length).toBeGreaterThanOrEqual(1);

    const delivery = claimed.find((d) => d.runId === testRunId);
    expect(delivery).toBeDefined();
    expect(delivery?.status).toBe('processing');

    // Subsequent immediate claim should find 0 as it is already 'processing'
    const secondClaim = await runDocumentDeliveryRepository.claimBatch({ limit: 10 });
    const secondDelivery = secondClaim.find((d) => d.id === delivery?.id);
    expect(secondDelivery).toBeUndefined();
  });

  it('reclaims stale processing jobs older than 5 minutes', async () => {
    const staleDate = new Date(Date.now() - 6 * 60 * 1000); // 6 mins ago

    const [created] = await runDocumentDeliveryRepository.createDeliveries([
      {
        runId: testRunId,
        workflowId: testWorkflowId,
        tenantId: testTenantId,
        destinationType: 'webhook',
        destinationConfig: { url: 'https://example.com/stale-hook' },
        status: 'processing',
        attempts: 1,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        auditLog: [],
      },
    ]);

    // Force updatedAt back in time to simulate stale worker crash
    await db
      .update(schema.runDocumentDeliveries)
      .set({ updatedAt: staleDate })
      .where(eq(schema.runDocumentDeliveries.id, created.id));

    // Claim batch should reclaim this stale processing job
    const batch = await runDocumentDeliveryRepository.claimBatch({ limit: 10 });
    const reclaimed = batch.find((d) => d.id === created.id);

    expect(reclaimed).toBeDefined();
    expect(reclaimed?.status).toBe('processing');
  });

  it('updates audit log and marks job delivered', async () => {
    const [created] = await runDocumentDeliveryRepository.createDeliveries([
      {
        runId: testRunId,
        workflowId: testWorkflowId,
        tenantId: testTenantId,
        destinationType: 'email',
        destinationConfig: { to: 'audit@example.com' },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        auditLog: [],
      },
    ]);

    const auditEntry = {
      timestamp: new Date().toISOString(),
      attempt: 1,
      status: 'delivered' as const,
      responseCode: 200,
      durationMs: 120,
    };

    const delivered = await runDocumentDeliveryRepository.markDelivered(created.id, auditEntry);
    expect(delivered.status).toBe('delivered');
    expect(delivered.deliveredAt).not.toBeNull();
    expect(delivered.attempts).toBe(1);
    expect(delivered.auditLog).toHaveLength(1);
    const logEntries = delivered.auditLog as DeliveryAuditLogEntry[];
    expect(logEntries[0]).toMatchObject({ status: 'delivered', responseCode: 200 });
  });
});
