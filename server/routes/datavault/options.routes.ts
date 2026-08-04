import { z } from 'zod';

import { logger } from '../../logger';
import { getAuthUserId, optionalHybridAuth } from '../../middleware/auth';
import { creatorOrRunTokenAuth, type RunAuthRequest } from '../../middleware/runTokenAuth';
import { projectRepository } from '../../repositories/ProjectRepository';
import { userRepository } from '../../repositories/UserRepository';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { datavaultColumnsService, datavaultRowsService, datavaultTablesService } from '../../services';
import { asyncHandler } from '../../utils/asyncHandler';
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

async function resolveWorkflowTenantId(workflowId: string): Promise<string> {
  const workflow = await workflowRepository.findById(workflowId);
  if (!workflow) {
    throw new Error('Workflow not found');
  }
  if (typeof workflow.projectId === 'string') {
    const project = await projectRepository.findById(workflow.projectId);
    if (typeof project?.tenantId === 'string') {
      return project.tenantId;
    }
  }
  if (typeof workflow.creatorId !== 'string') {
    throw new Error('Access denied - run workflow has no tenant');
  }
  const creator = await userRepository.findById(workflow.creatorId);
  if (typeof creator?.tenantId === 'string') {
    return creator.tenantId;
  }
  throw new Error('Access denied - run workflow has no tenant');
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

        // Distinguish an unknown table (404) from an existing table without
        // caller permission (403), while preserving cross-tenant denial.
        await datavaultTablesService.verifyTenantOwnership(tableId, tenantId);
        if (userId && !runAuth) {
          await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'read');
        }

        const columns = await datavaultColumnsService.listColumns(tableId, tenantId);
        const tableColumnIds = new Set(columns.map((column) => column.id));
        if (!tableColumnIds.has(columnId) || (labelColumnId && !tableColumnIds.has(labelColumnId))) {
          return res.status(400).json({ message: 'Invalid column ID for table' });
        }

        const labelId = labelColumnId ?? columnId;
        const requestedColumnIds = labelId === columnId ? [columnId] : [columnId, labelId];
        const { rows } = await datavaultRowsService.getRowsWithOptions(
          tenantId,
          tableId,
          { limit, offset: 0, showArchived: false, columnIds: requestedColumnIds }
        );
        const options = rows.map(({ values }) => {
          const value = values[columnId];
          return {
            value: toOptionString(value),
            label: toOptionString(values[labelId] ?? value),
          };
        });

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
