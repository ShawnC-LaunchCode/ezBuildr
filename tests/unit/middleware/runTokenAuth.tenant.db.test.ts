import { randomUUID } from 'crypto';

import { beforeAll, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../../server/db';
import { runTokenAuth, type RunAuthRequest } from '../../../server/middleware/runTokenAuth';
import type { DbTransaction } from '../../../server/repositories/BaseRepository';
import { getCurrentTenantId, runWithRequestContext } from '../../../server/utils/rlsContext';
import { hashToken } from '../../../server/utils/encryption';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { TestFactory } from '../../helpers/testFactory';

import type { NextFunction, Response } from 'express';

/**
 * `runTokenAuth` must leave a TENANT in the async context, not just a `runAuth`
 * object (RLS-2e/RLS-4).
 *
 * A run token is not a tenant JWT, so nothing else in the request populates
 * that context — every converted service reached from a public link or an
 * anonymous run depends entirely on this middleware having resolved it. The
 * resolution was written as best-effort ("leave the context empty rather than
 * invent a tenant") and swallows its own failures, so when it silently stopped
 * working NO test showed it: `req.runAuth` was still set, the route still ran,
 * and only the RLS-scoped reads downstream came back empty.
 *
 * `docs/architecture/RLS_HANDOFF.md` flagged exactly this as "worth verifying, not
 * assumed" before enforcement. This is that verification: it asserts the
 * resolved tenant id, so a regression in the resolution — or in migration
 * 0030's `app.current_workflow_id` clause that makes the workflow readable
 * before a tenant is known — fails here rather than in production.
 */
describeWithDb('runTokenAuth tenant resolution', () => {
  let tenantId: string;
  let workflowId: string;
  let runId: string;
  const runToken = `run-token-${randomUUID()}`;

  beforeAll(async () => {
    const factory = new TestFactory(db as unknown as DbTransaction);
    const { tenant, user, project } = await factory.createTenant();
    tenantId = tenant.id;

    const [workflow] = await db
      .insert(schema.workflows)
      .values({
        id: randomUUID(),
        title: 'Run token tenant resolution',
        slug: `run-token-tenant-${randomUUID()}`,
        creatorId: user.id,
        projectId: project.id,
        ownerType: 'user',
        ownerUuid: user.id,
      })
      .returning();
    workflowId = workflow.id;

    const [run] = await db
      .insert(schema.workflowRuns)
      .values({
        workflowId,
        // Stored hashed, exactly as the run-creation path stores it.
        runToken: hashToken(runToken),
      })
      .returning();
    runId = run.id;
  });

  /** Drive the middleware the way Express does, inside a request context. */
  async function callMiddleware(token: string): Promise<{
    req: RunAuthRequest;
    status: number | undefined;
    nextCalled: boolean;
    tenantInContext: string | undefined;
  }> {
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as RunAuthRequest;
    let status: number | undefined;
    const res = {
      status: vi.fn((code: number) => { status = code; return res; }),
      json: vi.fn(() => res),
    } as unknown as Response;
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };

    // `runWithRequestContext` is what `server/middleware/rlsContext.ts` opens
    // for a real request — without it `setCurrentTenantId` is a documented
    // no-op, and this test would pass for the wrong reason.
    const tenantInContext = await runWithRequestContext(async () => {
      await runTokenAuth(req, res, next);
      return getCurrentTenantId();
    });

    return { req, status, nextCalled, tenantInContext };
  }

  it('resolves the run workflow tenant into the async context', async () => {
    const { req, nextCalled, tenantInContext } = await callMiddleware(runToken);

    expect(nextCalled).toBe(true);
    expect(req.runAuth).toEqual({ runId, workflowId, runToken });
    // The assertion that matters: a converted service reached from here can
    // find a tenant. Without it every RLS-scoped read downstream is unscoped.
    expect(tenantInContext).toBe(tenantId);
  });

  it('rejects an unknown token without inventing a tenant', async () => {
    const { status, nextCalled, tenantInContext } = await callMiddleware(`run-token-${randomUUID()}`);

    expect(nextCalled).toBe(false);
    expect(status).toBe(401);
    expect(tenantInContext).toBeUndefined();
  });
});
