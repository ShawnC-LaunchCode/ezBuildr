import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import type { ChoiceAdvancedConfig } from '@shared/types/stepConfigs';

import { db } from '../../server/db';
import { rlsContext } from '../../server/middleware/rlsContext';
import { registerDatavaultRoutes } from '../../server/routes/datavault.routes';
import {
  datavaultColumnsService,
  datavaultRowsService,
  datavaultTablesService,
} from '../../server/services';
import { authService } from '../../server/services/AuthService';
import { hashToken } from '../../server/utils/encryption';
import { runWithTenantContext } from '../../server/utils/rlsContext';
import { TestFactory } from '../helpers/testFactory';

import type { Server } from 'http';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

interface OptionsResponse {
  options: Array<{ value: string; label: string }>;
}

describe.sequential('DataVault-backed dynamic choice options', () => {
  let server: Server;
  let baseURL: string;
  let tenantId: string;
  let otherTenantId: string;
  let userId: string;
  let userToken: string;
  let sameTenantReaderToken: string;
  let tableId: string;
  let valueColumnId: string;
  let labelColumnId: string;
  let secretColumnId: string;
  let visibleRowId: string;
  let archivedRowId: string;
  let choiceStepId: string;
  let runToken: string;
  let otherTenantRunToken: string;

  const getOptions = async (
    token: string,
    params: Record<string, string> = {},
    targetTableId = tableId
  ): Promise<Response> => {
    const query = new URLSearchParams(params).toString();
    const querySuffix = query ? `?${query}` : '';
    return fetch(
      `${baseURL}/api/datavault/tables/${targetTableId}/options${querySuffix}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  };

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    // RLS-2b: mount BEFORE registerDatavaultRoutes, mirroring server/index.ts
    // — DataVault services now open a service-boundary tenant transaction
    // that reads from this context (see integrationTestHelper.ts for the
    // same fix applied to the shared harness).
    app.use(rlsContext);
    registerDatavaultRoutes(app);
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Integration server did not bind to a TCP port');
    }
    baseURL = `http://localhost:${address.port}`;

    const factory = new TestFactory();
    const primary = await factory.createTenant({
      user: { email: `dynamic-options-${randomUUID()}@example.com` },
    });
    tenantId = primary.tenant.id;
    userId = primary.user.id;
    userToken = authService.createToken(primary.user);

    const other = await factory.createTenant({
      user: { email: `dynamic-options-other-${randomUUID()}@example.com` },
    });
    otherTenantId = other.tenant.id;

    const [sameTenantReader] = await getOwnerDb().insert(schema.users).values({
      id: randomUUID(),
      tenantId,
      email: `dynamic-options-viewer-${randomUUID()}@example.com`,
      role: 'creator',
      tenantRole: 'viewer',
      authProvider: 'local',
    }).returning();
    sameTenantReaderToken = authService.createToken(sameTenantReader);

    // RLS-2b: these DataVault service calls open their own tenant transaction
    // via the request's async context, and this is direct seeding (no HTTP
    // request), so open that context explicitly — same reasoning as
    // transferOwnership.test.ts and integrationTestHelper.ts.
    await runWithTenantContext(tenantId, async () => {
      const table = await datavaultTablesService.createTable({
        tenantId,
        ownerUserId: userId,
        name: 'Interview choices',
        slug: `interview-choices-${randomUUID()}`,
      });
      tableId = table.id;

      const valueColumn = await datavaultColumnsService.createColumn({
        tableId,
        name: 'Choice code',
        type: 'text',
      }, tenantId);
      valueColumnId = valueColumn.id;
      const labelColumn = await datavaultColumnsService.createColumn({
        tableId,
        name: 'Choice label',
        type: 'text',
      }, tenantId);
      labelColumnId = labelColumn.id;
      const secretColumn = await datavaultColumnsService.createColumn({
        tableId,
        name: 'Internal note',
        type: 'text',
      }, tenantId);
      secretColumnId = secretColumn.id;

      const visibleRow = await datavaultRowsService.createRow(tableId, tenantId, {
        [valueColumnId]: 'alpha',
        [labelColumnId]: 'Alpha label',
        [secretColumnId]: 'must-not-leak',
      }, userId);
      visibleRowId = visibleRow.row.id;
      const archivedRow = await datavaultRowsService.createRow(tableId, tenantId, {
        [valueColumnId]: 'archived',
        [labelColumnId]: 'Archived label',
        [secretColumnId]: 'archived-secret',
      }, userId);
      archivedRowId = archivedRow.row.id;
      await datavaultRowsService.archiveRow(tenantId, archivedRowId);
    });

    const { workflow } = await factory.createWorkflow(primary.project.id, userId, {
      workflow: { ownerType: 'user', ownerUuid: userId },
    });
    const section = await factory.createSection(workflow.id);
    const choiceConfig: ChoiceAdvancedConfig = {
      display: 'dropdown',
      allowMultiple: false,
      options: {
        type: 'table_column',
        dataSourceId: 'native',
        tableId,
        columnId: valueColumnId,
        labelColumnId,
        limit: 25,
      },
    };
    const choiceStep = await factory.createStep(section.id, {
      type: 'choice',
      title: 'Choose a record',
      config: choiceConfig,
    });
    choiceStepId = choiceStep.id;

    runToken = `dynamic-options-${randomUUID()}`;
    await getOwnerDb().insert(schema.workflowRuns).values({
      workflowId: workflow.id,
      runToken: hashToken(runToken),
      tokenExpiresAt: new Date(Date.now() + 60_000),
      createdBy: 'anon',
    });

    const { workflow: otherWorkflow } = await factory.createWorkflow(
      other.project.id,
      other.user.id,
      { workflow: { ownerType: 'user', ownerUuid: other.user.id } }
    );
    otherTenantRunToken = `dynamic-options-other-${randomUUID()}`;
    await getOwnerDb().insert(schema.workflowRuns).values({
      workflowId: otherWorkflow.id,
      runToken: hashToken(otherTenantRunToken),
      tokenExpiresAt: new Date(Date.now() + 60_000),
      createdBy: 'anon',
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (otherTenantId) {
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
    }
    if (tenantId) {
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    }
  });

  it('stores the table-column binding on the workflow choice step', async () => {
    const [storedStep] = await db
      .select({ config: schema.steps.config })
      .from(schema.steps)
      .where(eq(schema.steps.id, choiceStepId));
    const storedConfig = storedStep.config as ChoiceAdvancedConfig;

    expect(storedConfig.options).toMatchObject({
      type: 'table_column',
      tableId,
      columnId: valueColumnId,
      labelColumnId,
    });
  });

  it('returns only requested value/label pairs and excludes archived rows', async () => {
    const response = await getOptions(userToken, {
      columnId: valueColumnId,
      labelColumnId,
      limit: '25',
    });
    expect(response.status).toBe(200);
    const body = await response.json() as OptionsResponse;

    expect(body).toEqual({ options: [{ value: 'alpha', label: 'Alpha label' }] });
    expect(Object.keys(body.options[0] ?? {}).sort()).toEqual(['label', 'value']);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(visibleRowId);
    expect(serialized).not.toContain(archivedRowId);
    expect(serialized).not.toContain('must-not-leak');
    expect(serialized).not.toContain('Archived label');
  });

  it('falls back to the value column when labelColumnId is omitted', async () => {
    const response = await getOptions(userToken, { columnId: valueColumnId });
    expect(response.status).toBe(200);

    expect(await response.json() as OptionsResponse).toEqual({
      options: [{ value: 'alpha', label: 'alpha' }],
    });
  });

  it('rejects missing, malformed, foreign, and over-limit query values with 400', async () => {
    expect((await getOptions(userToken)).status).toBe(400);
    expect((await getOptions(userToken, { columnId: 'not-a-uuid' })).status).toBe(400);
    expect((await getOptions(userToken, { columnId: randomUUID() })).status).toBe(400);
    expect((await getOptions(userToken, {
      columnId: valueColumnId,
      limit: '1001',
    })).status).toBe(400);
  });

  it('returns 403 without table read permission and 404 for an unknown table', async () => {
    expect((await getOptions(sameTenantReaderToken, { columnId: valueColumnId })).status).toBe(403);
    expect((await getOptions(userToken, { columnId: valueColumnId }, randomUUID())).status).toBe(404);
  });

  it('allows a same-tenant run token and denies a different-tenant run token with 403', async () => {
    const allowed = await getOptions(runToken, { columnId: valueColumnId, labelColumnId });
    expect(allowed.status).toBe(200);
    expect(await allowed.json() as OptionsResponse).toEqual({
      options: [{ value: 'alpha', label: 'Alpha label' }],
    });

    const denied = await getOptions(otherTenantRunToken, { columnId: valueColumnId, labelColumnId });
    expect(denied.status).toBe(403);
  });
});
