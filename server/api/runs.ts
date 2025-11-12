import { Router, type Request, Response } from 'express';
import { eq, and, desc, lt } from 'drizzle-orm';
import path from 'path';
import { db } from '../db';
import * as schema from '@shared/schema';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { createError, formatErrorResponse } from '../utils/errors';
import { createPaginatedResponse, decodeCursor } from '../utils/pagination';
import { runGraph } from '../engine';
import { createRun, updateRun, createRunLogs, getRunById, getRunLogs } from '../services/runs';
import { getTemplateFilePath, templateFileExists, getOutputFilePath, outputFileExists } from '../services/templates';
import type { AuthRequest } from '../middleware/auth';
import {
  createRunSchema,
  listRunsQuerySchema,
  listRunLogsQuerySchema,
  downloadRunQuerySchema,
  runParamsSchema,
  workflowIdParamsSchema,
  type CreateRunResponse,
  type RunLogEntry,
} from './validators/runs';

const router = Router();

/**
 * POST /workflows/:id/run
 * Execute a workflow
 */
router.post(
  '/workflows/:id/run',
  requireAuth,
  requireTenant,
  requirePermission('workflow:run'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const userId = authReq.userId!;

      // Validate params and body
      const params = workflowIdParamsSchema.parse(req.params);
      const data = createRunSchema.parse(req.body);

      // Fetch workflow with project
      const workflow = await db.query.workflows.findFirst({
        where: eq(schema.workflows.id, params.id),
        with: {
          project: true,
          versions: {
            where: eq(schema.workflowVersions.published, true),
            orderBy: [desc(schema.workflowVersions.publishedAt)],
            limit: 1,
          },
        },
      });

      if (!workflow) {
        throw createError.notFound('Workflow', params.id);
      }

      // Verify tenant access
      if (workflow.project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this workflow');
      }

      // Determine which version to use
      let workflowVersion: schema.WorkflowVersion | undefined;

      if (data.versionId) {
        // Use specified version
        const version = await db.query.workflowVersions.findFirst({
          where: and(
            eq(schema.workflowVersions.id, data.versionId),
            eq(schema.workflowVersions.workflowId, params.id)
          ),
        });

        if (!version) {
          throw createError.notFound('WorkflowVersion', data.versionId);
        }

        workflowVersion = version;
      } else {
        // Use latest published version
        if (workflow.versions.length === 0) {
          throw createError.workflowNoVersion();
        }

        workflowVersion = workflow.versions[0];
      }

      // Create run record
      const run = await createRun({
        workflowVersionId: workflowVersion.id,
        inputJson: data.inputJson,
        status: 'pending',
        createdBy: userId,
      });

      // Execute workflow asynchronously
      const startTime = Date.now();

      try {
        // Run the workflow engine
        const result = await runGraph({
          workflowVersion,
          inputJson: data.inputJson,
          tenantId,
          options: data.options,
        });

        const durationMs = Date.now() - startTime;

        // Update run with results
        const updatedRun = await updateRun(run.id, {
          status: result.status === 'success' ? 'success' : 'error',
          outputRefs: result.outputRefs,
          durationMs,
        });

        // Create run logs
        const logEntries = result.logs.map(log => ({
          runId: run.id,
          nodeId: log.nodeId || null,
          level: log.level,
          message: log.message,
          context: log.context || null,
        }));

        await createRunLogs(logEntries);

        // Prepare response
        const response: CreateRunResponse = {
          runId: updatedRun.id,
          status: updatedRun.status,
          outputRefs: updatedRun.outputRefs as Record<string, any>,
          durationMs: updatedRun.durationMs || undefined,
        };

        // Include logs if debug mode
        if (data.options?.debug) {
          response.logs = result.logs.map(log => ({
            level: log.level,
            message: log.message,
            timestamp: log.timestamp.toISOString(),
          }));
        }

        res.status(201).json(response);
      } catch (error) {
        // Update run as error
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await updateRun(run.id, {
          status: 'error',
          durationMs: Date.now() - startTime,
        });

        // Create error log
        await createRunLogs([
          {
            runId: run.id,
            nodeId: null,
            level: 'error',
            message: `Workflow execution failed: ${errorMessage}`,
            context: null,
          },
        ]);

        throw createError.internal('Workflow execution failed', { error: errorMessage });
      }
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /runs
 * List runs (optionally filtered by workflowId)
 */
router.get(
  '/runs',
  requireAuth,
  requireTenant,
  requirePermission('run:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate query
      const query = listRunsQuerySchema.parse(req.query);
      const { cursor, limit, workflowId } = query;

      // Build where conditions
      const whereConditions: any[] = [];

      // Filter by workflow if provided
      if (workflowId) {
        // Verify workflow belongs to tenant
        const workflow = await db.query.workflows.findFirst({
          where: eq(schema.workflows.id, workflowId),
          with: { project: true },
        });

        if (!workflow || workflow.project.tenantId !== tenantId) {
          throw createError.notFound('Workflow', workflowId);
        }

        // Get all versions for this workflow
        const versions = await db.query.workflowVersions.findMany({
          where: eq(schema.workflowVersions.workflowId, workflowId),
          columns: { id: true },
        });

        const versionIds = versions.map(v => v.id);

        if (versionIds.length > 0) {
          whereConditions.push(
            eq(schema.runs.workflowVersionId, versionIds[0]) // Simplified for stub
          );
        }
      }

      // Add cursor condition
      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded) {
          whereConditions.push(lt(schema.runs.createdAt, new Date(decoded.timestamp)));
        }
      }

      // Fetch runs with tenant filtering through workflowVersion -> workflow -> project
      const runs = await db.query.runs.findMany({
        where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
        orderBy: [desc(schema.runs.createdAt)],
        limit: limit + 1,
        with: {
          workflowVersion: {
            with: {
              workflow: {
                with: {
                  project: true,
                },
              },
            },
          },
          createdByUser: {
            columns: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      // Filter by tenant (since we can't do it in the query easily)
      const tenantRuns = runs.filter(
        run => run.workflowVersion.workflow.project.tenantId === tenantId
      );

      // Create paginated response
      const response = createPaginatedResponse(tenantRuns, limit);

      res.json(response);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /runs/:id
 * Get run by ID
 */
router.get(
  '/runs/:id',
  requireAuth,
  requireTenant,
  requirePermission('run:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params
      const params = runParamsSchema.parse(req.params);

      // Fetch run
      const run = await getRunById(params.id);

      if (!run) {
        throw createError.notFound('Run', params.id);
      }

      // Verify tenant access through workflowVersion -> workflow -> project
      const workflow = run.workflowVersion?.workflow;
      if (!workflow) {
        throw createError.notFound('Run workflow');
      }

      const project = await db.query.projects.findFirst({
        where: eq(schema.projects.id, workflow.projectId),
      });

      if (!project || project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this run');
      }

      res.json(run);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /runs/:id/logs
 * Get logs for a run
 */
router.get(
  '/runs/:id/logs',
  requireAuth,
  requireTenant,
  requirePermission('run:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params and query
      const params = runParamsSchema.parse(req.params);
      const query = listRunLogsQuerySchema.parse(req.query);

      // Fetch run to verify access
      const run = await getRunById(params.id);

      if (!run) {
        throw createError.notFound('Run', params.id);
      }

      // Verify tenant access
      const workflow = run.workflowVersion?.workflow;
      if (!workflow) {
        throw createError.notFound('Run workflow');
      }

      const project = await db.query.projects.findFirst({
        where: eq(schema.projects.id, workflow.projectId),
      });

      if (!project || project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this run');
      }

      // Fetch logs
      const logs = await getRunLogs(params.id, {
        limit: query.limit,
        cursor: query.cursor,
      });

      // Format logs
      const formattedLogs: RunLogEntry[] = logs.map(log => ({
        id: log.id,
        runId: log.runId,
        nodeId: log.nodeId,
        level: log.level,
        message: log.message,
        context: log.context as Record<string, any> | null,
        createdAt: log.createdAt!.toISOString(),
      }));

      // Create paginated response
      const response = createPaginatedResponse(
        formattedLogs as any,
        query.limit
      );

      res.json(response);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /runs/:id/download
 * Download run output file (DOCX or PDF)
 */
router.get(
  '/runs/:id/download',
  requireAuth,
  requireTenant,
  requirePermission('run:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params and query
      const params = runParamsSchema.parse(req.params);
      const query = downloadRunQuerySchema.parse(req.query);

      // Fetch run
      const run = await getRunById(params.id);

      if (!run) {
        throw createError.notFound('Run', params.id);
      }

      // Verify tenant access
      const workflow = run.workflowVersion?.workflow;
      if (!workflow) {
        throw createError.notFound('Run workflow');
      }

      const project = await db.query.projects.findFirst({
        where: eq(schema.projects.id, workflow.projectId),
      });

      if (!project || project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this run');
      }

      // Check if run has output
      if (!run.outputRefs || run.status !== 'success') {
        throw createError.notFound('Run output not available');
      }

      const outputRefs = run.outputRefs as Record<string, any>;

      // Determine which file to download (docx or pdf)
      let fileRef: string | undefined;
      let mimeType: string;
      let extension: string;

      if (query.type === 'pdf') {
        // Try to get PDF version
        fileRef = outputRefs.document?.pdfRef || outputRefs.pdfRef;
        mimeType = 'application/pdf';
        extension = 'pdf';

        if (!fileRef) {
          throw createError.notFound('PDF output not available. Only DOCX format was generated.');
        }
      } else {
        // Default to DOCX
        fileRef = outputRefs.document?.fileRef || outputRefs.fileRef;
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        extension = 'docx';
      }

      if (!fileRef) {
        throw createError.notFound('Output document');
      }

      // Check if file exists in outputs directory
      const exists = await outputFileExists(fileRef);
      if (!exists) {
        throw createError.notFound('Output file');
      }

      // Get file path from outputs directory
      const filePath = getOutputFilePath(fileRef);

      // Set headers for download
      const filename = `run-${run.id}-output.${extension}`;
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Send file
      res.sendFile(filePath);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

export default router;
