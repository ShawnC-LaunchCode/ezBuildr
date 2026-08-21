import { z } from 'zod';

import { logger } from '../../logger';
import { getAuthUserId, optionalHybridAuth } from '../../middleware/auth';
import { creatorOrRunTokenAuth, type RunAuthRequest } from '../../middleware/runTokenAuth';
import { datavaultColumnsService, datavaultRowsService, datavaultTablesService } from '../../services';
import { workflowTenantResolver } from '../../services/WorkflowTenantResolver';
import { asyncHandler } from '../../utils/asyncHandler';
import { runWithTenantContext, withVerifiedIdentifier } from '../../utils/rlsContext';
import { classifyRouteError } from '../../utils/routeErrors';
import { paginationSchema } from '../../utils/validation';

import { ERROR_AUTH_REQUIRED, ERROR_INVALID_INPUT, getTenantId } from './shared';

import type { Express, Request, Response } from 'express';

const optionsRequestSchema = z.object({
  tableId: z.string().uuid(),
  columnId: z.string().uuid(),
  labelColumnId: z.string().uuid().optional(),
  limit: paginationSchema.shape.limit,
});

function toOptionString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value) ?? String(value);
  }
  return String(value);
}

/**
 * Resolve the tenant for a run-token caller, who has no tenant context of
 * their own.
 *
 * This was a local re-implementation of the workflow -> project -> creator
 * ownership walk, issued on the bare pool. Two problems, one of which RLS
 * only made visible: `workflows`, `projects` and `users` are all RLS-covered,
 * so under enforcement each hop returns nothing; and a hand-rolled copy of
 * the resolution order drifts from the real one — `WorkflowTenantResolver` is
 * the single implementation, and migration 0033 exists precisely because
 * getting that order wrong resolves CONFIDENTLY to the wrong tenant rather
 * than failing.
 *
 * `app.current_workflow_id` is pinned for the lookup exactly as
 * `runTokenAuth` does it: the workflow id came from a verified run-token
 * match on `workflow_runs`, so migration 0030's clause may trust it.
 */
async function resolveWorkflowTenantId(workflowId: string): Promise<string> {
  const tenantId = await withVerifiedIdentifier(
    'app.current_workflow_id',
    workflowId,
    (tx) => workflowTenantResolver.resolveForWorkflowId(workflowId, tx)
  );
  if (!tenantId) {
    throw new Error('Access denied - run workflow has no tenant');
  }
  return tenantId;
}

/** Register the runner-safe DataVault choice-option endpoint. */
export function registerDatavaultOptionRoutes(app: Express): void {
  app.get(
    '/api/datavault/tables/:tableId/options',
    optionalHybridAuth,
    creatorOrRunTokenAuth,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { tableId, columnId, labelColumnId, limit } = optionsRequestSchema.parse({
          tableId: req.params.tableId,
          columnId: req.query.columnId,
          labelColumnId: req.query.labelColumnId,
          limit: req.query.limit,
        });
        const userId = getAuthUserId(req);
        const runAuth = (req as RunAuthRequest).runAuth;

        if (!userId && !runAuth) {
          return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
        }

        const tenantId = runAuth
          ? await resolveWorkflowTenantId(runAuth.workflowId)
          : getTenantId(req);

        // RLS-2b: the DataVault services below now open a service-boundary
        // tenant transaction that reads the AMBIENT tenant from the request's
        // async context (RLS-1). That context is populated by hybridAuth's
        // bearer/cookie resolution, but NOT by `creatorOrRunTokenAuth` — the
        // run-token path resolves `tenantId` itself (above, via
        // `resolveWorkflowTenantId`) through a different mechanism entirely.
        // Wrap explicitly with the tenantId this route already computed
        // rather than relying on ambient context, so both auth paths work.
        // Harmless no-op on the hybridAuth path (same value, freshly nested).
        const options = await runWithTenantContext(tenantId, async () => {
          // Distinguish an unknown table (404) from an existing table without
          // caller permission (403), while preserving cross-tenant denial.
          await datavaultTablesService.verifyTenantOwnership(tableId, tenantId);
          if (userId && !runAuth) {
            await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'read');
          }

          const columns = await datavaultColumnsService.listColumns(tableId, tenantId);
          const tableColumnIds = new Set(columns.map((column) => column.id));
          if (!tableColumnIds.has(columnId) || (labelColumnId && !tableColumnIds.has(labelColumnId))) {
            return null;
          }

          const labelId = labelColumnId ?? columnId;
          const requestedColumnIds = labelId === columnId ? [columnId] : [columnId, labelId];
          const { rows } = await datavaultRowsService.getRowsWithOptions(
            tenantId,
            tableId,
            { limit, offset: 0, showArchived: false, columnIds: requestedColumnIds }
          );
          return rows.map(({ values }) => {
            const value = values[columnId];
            return {
              value: toOptionString(value),
              label: toOptionString(values[labelId] ?? value),
            };
          });
        });

        if (options === null) {
          return res.status(400).json({ message: 'Invalid column ID for table' });
        }

        res.json({ options });
      } catch (error) {
        logger.error({ error }, 'Error fetching DataVault choice options');
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            message: ERROR_INVALID_INPUT,
            errors: error.errors,
          });
        }
        const { status, message } = classifyRouteError(error, 'Failed to fetch options');
        res.status(status).json({ message });
      }
    })
  );
}
