import path from 'path';
import { eq, and, desc, lt, sql } from 'drizzle-orm';
import { Router, type Request, Response } from 'express';
import * as schema from '@shared/schema';
import { db } from '../db';
import { runGraph } from '../engine';
import { hybridAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { requireTenant } from '../middleware/tenant';
import { createRun, updateRun, createRunLogs, getRunById, getRunLogs } from '../services/runs';
import {   getOutputFilePath, outputFileExists } from '../services/templates';
import { createError, formatErrorResponse } from '../utils/errors';
import { createPaginatedResponse, decodeCursor } from '../utils/pagination';
import {
  createRunSchema,
  listRunsQuerySchema,
  listRunLogsQuerySchema,
  downloadRunQuerySchema,
  runParamsSchema,
  workflowIdParamsSchema,
  rerunSchema, // Stage 8
  exportRunsQuerySchema, // Stage 8
  compareRunsQuerySchema, // Stage 8
  type CreateRunResponse,
  type RunLogEntry,
  type RerunRequest, // Stage 8
} from './validators/runs';
import type { AuthRequest } from '../middleware/auth';
const router = Router();
/**
 * POST /workflows/:id/run
 * Execute a workflow
 */
router.post(
  '/workflows/:id/run',
  hybridAuth,
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
      if (!workflow.project || workflow.project.tenantId !== tenantId) {
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
        // Run the workflow engine (Stage 8: Always enable debug to capture trace)
        const result = await runGraph({
          workflowVersion: workflowVersion,
          inputJson: data.inputJson,
          tenantId,
          options: { ...data.options, debug: true }, // Always capture trace for Stage 8
        });
        const durationMs = Date.now() - startTime;
        // Update run with results (Stage 8: Store trace and error)
        const updatedRun = await updateRun(run.id, {
          status: result.status === 'success' ? 'success' : 'error',
          outputRefs: result.outputRefs,
          trace: result.trace || null, // Stage 8: Store execution trace
          error: result.error || null, // Stage 8: Store error message
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
        // Update run as error (Stage 8: Store error message)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await updateRun(run.id, {
          status: 'error',
          error: errorMessage, // Stage 8: Store error message
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
 * Stage 8: Enhanced list runs with filters (status, workflow, project, date range, search)
 */
router.get(
  '/runs',
  hybridAuth,
  requireTenant,
  requirePermission('run:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      // Validate query
      const query = listRunsQuerySchema.parse(req.query);
      const { cursor, limit, workflowId, projectId, status, from, to, q } = query;
      // Build query with joins for correct filtering
      // Stage 8: Scalable filtering via SQL joins
      let baseQuery = db.select({
        run: schema.runs,
        // We select enough to reconstruct the basic view or join relations
        // For simple listing, we mainly need the run and its user
        user: {
          id: schema.users.id,
          email: schema.users.email,
          fullName: schema.users.fullName,
        },
        workflow: {
          id: schema.workflows.id,
          name: schema.workflows.name,
          projectId: schema.workflows.projectId,
        },
        workflowVersion: {
          id: schema.workflowVersions.id,
          version: schema.workflowVersions.versionNumber,
        },
        project: {
          id: schema.projects.id,
          name: schema.projects.name,
        }
      })
        .from(schema.runs)
        .innerJoin(schema.workflowVersions, eq(schema.runs.workflowVersionId, schema.workflowVersions.id))
        .innerJoin(schema.workflows, eq(schema.workflowVersions.workflowId, schema.workflows.id))
        .leftJoin(schema.projects, eq(schema.workflows.projectId, schema.projects.id))
        .leftJoin(schema.users, eq(schema.runs.createdBy, schema.users.id));
      const conditions: any[] = [];
      // 1. Tenant Isolation (CRITICAL)
      // We must only show runs from projects in the user's tenant
      if (tenantId) {
        conditions.push(eq(schema.projects.tenantId, tenantId));
      }
      // 2. Status Filter
      if (status) {
        conditions.push(eq(schema.runs.status, status));
      }
      // 3. Date Range
      if (from) {
        conditions.push(sql`${schema.runs.createdAt} >= ${new Date(from)}`);
      }
      if (to) {
        conditions.push(sql`${schema.runs.createdAt} <= ${new Date(to)}`);
      }
      // 4. Workflow ID
      if (workflowId) {
        conditions.push(eq(schema.workflows.id, workflowId));
      }
      // 5. Project ID
      if (projectId) {
        conditions.push(eq(schema.workflows.projectId, projectId));
      }
      // 6. Search Query
      if (q) {
        const lowerQ = `%${q.toLowerCase()}%`;
        conditions.push(
          sql`(${schema.runs.id}::text ILIKE ${lowerQ} OR ${schema.users.email} ILIKE ${lowerQ} OR ${schema.projects.name} ILIKE ${lowerQ} OR ${schema.workflows.name} ILIKE ${lowerQ} OR ${schema.runs.inputJson}::text ILIKE ${lowerQ})`
        );
      }
      // 7. Cursor Pagination
      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded) {
          conditions.push(lt(schema.runs.createdAt, new Date(decoded.timestamp)));
        }
      }
      // Apply conditions
      if (conditions.length > 0) {
        baseQuery = baseQuery.where(and(...conditions)) as typeof baseQuery;
      }
      // Apply ordering and limit
      const results = await baseQuery
        .orderBy(desc(schema.runs.createdAt))
        .limit(limit + 1);
      // Map to response format
      const formattedRuns = results.map(row => ({
        ...row.run,
        workflowVersion: {
          ...row.workflowVersion,
          workflow: {
            ...row.workflow,
            project: row.project // Include project info
          }
        },
        createdByUser: row.user
      }));
      // Create paginated response
      const response = createPaginatedResponse(formattedRuns, limit);
      res.json(response);
    } catch (error) {
      console.error("GET /runs FAILED:", error);
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);
/**
 * GET /runs/export.csv
 * Stage 8: Export runs list to CSV
 */
router.get(
  '/runs/export.csv',
  hybridAuth,
  requireTenant,
  requirePermission('run:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      // Validate query (same filters as list)
      const query = exportRunsQuerySchema.parse(req.query);
      const { workflowId, projectId, status, from, to, q } = query;
      // Build where conditions
      const whereConditions: any[] = [];
      if (status) {
        whereConditions.push(eq(schema.runs.status, status));
      }
      if (from) {
        whereConditions.push(
          sql`${schema.runs.createdAt} >= ${new Date(from)}`
        );
      }
      if (to) {
        whereConditions.push(
          sql`${schema.runs.createdAt} <= ${new Date(to)}`
        );
      }
      // Fetch all runs (no pagination limit for export)
      const runs = await db.query.runs.findMany({
        where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
        orderBy: [desc(schema.runs.createdAt)],
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
      type ExportRunWithRelations = typeof runs[number];
      // Apply tenant filtering + additional filters
      let filteredRuns = runs.filter((run: ExportRunWithRelations) => {
        // Verify tenant through workflow version
        const workflow = run.workflowVersion?.workflow;
        if (!workflow?.project) {return false;}
        // Verify tenant access to this workflow's project
        return workflow.project.tenantId === tenantId;
      });
      if (workflowId) {
        filteredRuns = filteredRuns.filter(
          (run: ExportRunWithRelations) => run.workflowVersion?.workflow?.id === workflowId
        );
      }
      if (projectId) {
        filteredRuns = filteredRuns.filter(
          (run: ExportRunWithRelations) => run.workflowVersion?.workflow?.projectId === projectId
        );
      }
      if (q) {
        const lowerQ = q.toLowerCase();
        filteredRuns = filteredRuns.filter((run: ExportRunWithRelations) => {
          if (run.id.toLowerCase().includes(lowerQ)) {return true;}
          if (run.createdByUser?.email?.toLowerCase().includes(lowerQ)) {return true;}
          if (run.inputJson && JSON.stringify(run.inputJson).toLowerCase().includes(lowerQ)) {
            return true;
          }
          return false;
        });
      }
      // Generate CSV
      const csvHeader = 'runId,projectId,workflowId,workflowName,versionId,status,durationMs,createdBy,createdAt\n';
      const csvRows = filteredRuns.map((run: ExportRunWithRelations) => {
        const workflow = run.workflowVersion?.workflow;
        return [
          run.id,
          workflow?.projectId || '',
          workflow?.id || '',
          workflow?.name || '',
          run.workflowVersionId,
          run.status,
          run.durationMs || '',
          run.createdByUser?.email || '',
          run.createdAt?.toISOString() || '',
        ].join(',');
      }).join('\n');
      const csv = csvHeader + csvRows;
      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="runs-export.csv"');
      res.send(csv);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);
/**
 * GET /runs/compare
 * Stage 8: Compare two runs
 */
router.get(
  '/runs/compare',
  hybridAuth,
  requireTenant,
  requirePermission('run:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      // Validate query
      const query = compareRunsQuerySchema.parse(req.query);
      const { runA: runIdA, runB: runIdB } = query;
      // Fetch both runs
      const [runA, runB] = await Promise.all([
        getRunById(runIdA),
        getRunById(runIdB),
      ]);
      if (!runA) {
        throw createError.notFound('Run A', runIdA);
      }
      if (!runB) {
        throw createError.notFound('Run B', runIdB);
      }
      // Verify tenant access for both
      const workflowA = runA.workflowVersion?.workflow;
      const workflowB = runB.workflowVersion?.workflow;
      if (!workflowA || !workflowB) {
        throw createError.notFound('Run workflow');
      }
      const [projectA, projectB] = await Promise.all([
        workflowA.projectId ? db.query.projects.findFirst({ where: eq(schema.projects.id, workflowA.projectId) }) : null,
        workflowB.projectId ? db.query.projects.findFirst({ where: eq(schema.projects.id, workflowB.projectId) }) : null,
      ]);
      if (!projectA || projectA.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to Run A');
      }
      if (!projectB || projectB.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to Run B');
      }
      // Compare inputs
      const inputsA = (runA.inputJson as Record<string, any>) || {};
      const inputsB = (runB.inputJson as Record<string, any>) || {};
      const allInputKeys = new Set([...Object.keys(inputsA), ...Object.keys(inputsB)]);
      const inputsChangedKeys: string[] = [];
      allInputKeys.forEach(key => {
        if (JSON.stringify(inputsA[key]) !== JSON.stringify(inputsB[key])) {
          inputsChangedKeys.push(key);
        }
      });
      // Compare outputs
      const outputsA = (runA.outputRefs as Record<string, any>) || {};
      const outputsB = (runB.outputRefs as Record<string, any>) || {};
      const allOutputKeys = new Set([...Object.keys(outputsA), ...Object.keys(outputsB)]);
      const outputsChangedKeys: string[] = [];
      allOutputKeys.forEach(key => {
        if (JSON.stringify(outputsA[key]) !== JSON.stringify(outputsB[key])) {
          outputsChangedKeys.push(key);
        }
      });
      // Prepare response
      res.json({
        runA: {
          id: runA.id,
          status: runA.status,
          createdAt: runA.createdAt,
        },
        runB: {
          id: runB.id,
          status: runB.status,
          createdAt: runB.createdAt,
        },
        summaryDiff: {
          inputsChangedKeys,
          outputsChangedKeys,
          statusMatch: runA.status === runB.status,
          durationDiff: (runA.durationMs || 0) - (runB.durationMs || 0),
        },
      });
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
  hybridAuth,
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
      if (!workflow.projectId) {
        throw createError.forbidden('Access denied (unfiled workflow)');
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
  hybridAuth,
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
      if (!workflow.projectId) {
        throw createError.forbidden('Access denied (unfiled workflow)');
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
  hybridAuth,
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
      if (!workflow.projectId) {
        throw createError.forbidden('Access denied (unfiled workflow)');
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
/**
 * POST /runs/:id/rerun
 * Stage 8: Re-run a workflow with same or override inputs
 */
router.post(
  '/runs/:id/rerun',
  hybridAuth,
  requireTenant,
  requirePermission('workflow:run'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const userId = authReq.userId!;
      // Validate params and body
      const params = runParamsSchema.parse(req.params);
      const data = rerunSchema.parse(req.body);
      // Fetch original run
      const originalRun = await getRunById(params.id);
      if (!originalRun) {
        throw createError.notFound('Run', params.id);
      }
      // Verify tenant access
      const workflow = originalRun.workflowVersion?.workflow;
      if (!workflow) {
        throw createError.notFound('Run workflow');
      }
      if (!workflow.projectId) {
        throw createError.forbidden('Access denied (unfiled workflow)');
      }
      const project = await db.query.projects.findFirst({
        where: eq(schema.projects.id, workflow.projectId),
      });
      if (!project || project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this run');
      }
      // Determine version to use (override or original)
      let workflowVersion: schema.WorkflowVersion;
      if (data.versionId) {
        // Use specified version
        const version = await db.query.workflowVersions.findFirst({
          where: and(
            eq(schema.workflowVersions.id, data.versionId),
            eq(schema.workflowVersions.workflowId, workflow.id)
          ),
        });
        if (!version) {
          throw createError.notFound('WorkflowVersion', data.versionId);
        }
        workflowVersion = version;
      } else {
        // Use original version
        workflowVersion = originalRun.workflowVersion!;
      }
      // Merge inputs (override or use original)
      const inputJson = data.overrideInputJson
        ? { ...((originalRun.inputJson as Record<string, any>) || {}), ...data.overrideInputJson }
        : (originalRun.inputJson as Record<string, any>) || {};
      // Create new run record
      const newRun = await createRun({
        workflowVersionId: workflowVersion.id,
        inputJson,
        status: 'pending',
        createdBy: userId,
      });
      // Execute workflow asynchronously
      const startTime = Date.now();
      try {
        // Run the workflow engine
        const result = await runGraph({
          workflowVersion,
          inputJson,
          tenantId,
          options: { ...data.options, debug: true }, // Always capture trace
        });
        const durationMs = Date.now() - startTime;
        // Update run with results
        const updatedRun = await updateRun(newRun.id, {
          status: result.status === 'success' ? 'success' : 'error',
          outputRefs: result.outputRefs,
          trace: result.trace || null,
          error: result.error || null,
          durationMs,
        });
        // Create run logs
        const logEntries = result.logs.map(log => ({
          runId: newRun.id,
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
        res.status(201).json(response);
      } catch (error) {
        // Update run as error
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await updateRun(newRun.id, {
          status: 'error',
          error: errorMessage,
          durationMs: Date.now() - startTime,
        });
        // Create error log
        await createRunLogs([
          {
            runId: newRun.id,
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
 * GET /runs/export.csv
 * Stage 8: Export runs list to CSV
 */
router.get(
  '/runs/export.csv',
  hybridAuth,
  requireTenant,
  requirePermission('run:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      // Validate query (same filters as list)
      const query = exportRunsQuerySchema.parse(req.query);
      const { workflowId, projectId, status, from, to, q } = query;
      // Build where conditions
      const whereConditions: any[] = [];
      if (status) {
        whereConditions.push(eq(schema.runs.status, status));
      }
      if (from) {
        whereConditions.push(
          sql`${schema.runs.createdAt} >= ${new Date(from)}`
        );
      }
      if (to) {
        whereConditions.push(
          sql`${schema.runs.createdAt} <= ${new Date(to)}`
        );
      }
      // Fetch all runs (no pagination limit for export)
      const runs = await db.query.runs.findMany({
        where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
        orderBy: [desc(schema.runs.createdAt)],
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
      type ExportRunWithRelations = typeof runs[number];
      // Apply tenant filtering + additional filters
      let filteredRuns = runs.filter((run: ExportRunWithRelations) => {
        // Verify tenant through workflow version
        const workflow = run.workflowVersion?.workflow;
        if (!workflow?.project) {return false;}
        // Verify tenant access to this workflow's project
        return workflow.project.tenantId === tenantId;
      });
      if (workflowId) {
        filteredRuns = filteredRuns.filter(
          (run: ExportRunWithRelations) => run.workflowVersion?.workflow?.id === workflowId
        );
      }
      if (projectId) {
        filteredRuns = filteredRuns.filter(
          (run: ExportRunWithRelations) => run.workflowVersion?.workflow?.projectId === projectId
        );
      }
      if (q) {
        const lowerQ = q.toLowerCase();
        filteredRuns = filteredRuns.filter((run: ExportRunWithRelations) => {
          if (run.id.toLowerCase().includes(lowerQ)) {return true;}
          if (run.createdByUser?.email?.toLowerCase().includes(lowerQ)) {return true;}
          if (run.inputJson && JSON.stringify(run.inputJson).toLowerCase().includes(lowerQ)) {
            return true;
          }
          return false;
        });
      }
      // Generate CSV
      const csvHeader = 'runId,projectId,workflowId,workflowName,versionId,status,durationMs,createdBy,createdAt\n';
      const csvRows = filteredRuns.map((run: ExportRunWithRelations) => {
        const workflow = run.workflowVersion?.workflow;
        return [
          run.id,
          workflow?.projectId || '',
          workflow?.id || '',
          workflow?.name || '',
          run.workflowVersionId,
          run.status,
          run.durationMs || '',
          run.createdByUser?.email || '',
          run.createdAt?.toISOString() || '',
        ].join(',');
      }).join('\n');
      const csv = csvHeader + csvRows;
      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="runs-export.csv"');
      res.send(csv);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);
/**
 * GET /runs/compare
 * Stage 8: Compare two runs
 */
router.get(
  '/runs/compare',
  hybridAuth,
  requireTenant,
  requirePermission('run:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      // Validate query
      const query = compareRunsQuerySchema.parse(req.query);
      // Fetch both runs
      const [runA, runB] = await Promise.all([
        getRunById(query.runA),
        getRunById(query.runB),
      ]);
      if (!runA) {
        throw createError.notFound('Run A', query.runA);
      }
      if (!runB) {
        throw createError.notFound('Run B', query.runB);
      }
      // Verify tenant access for both runs
      for (const run of [runA, runB]) {
        const workflow = run.workflowVersion?.workflow;
        if (!workflow) {
          throw createError.notFound('Run workflow');
        }
        if (!workflow.projectId) {
          throw createError.forbidden('Access denied (unfiled workflow)');
        }
        const project = await db.query.projects.findFirst({
          where: eq(schema.projects.id, workflow.projectId),
        });
        if (!project || project.tenantId !== tenantId) {
          throw createError.forbidden('Access denied to run');
        }
      }
      // Calculate diff summary (simplified)
      const inputsA = (runA.inputJson as Record<string, any>) || {};
      const inputsB = (runB.inputJson as Record<string, any>) || {};
      const allInputKeys = new Set([...Object.keys(inputsA), ...Object.keys(inputsB)]);
      const inputsChangedKeys = Array.from(allInputKeys).filter(
        key => JSON.stringify(inputsA[key]) !== JSON.stringify(inputsB[key])
      );
      const outputsA = (runA.outputRefs as Record<string, any>) || {};
      const outputsB = (runB.outputRefs as Record<string, any>) || {};
      const allOutputKeys = new Set([...Object.keys(outputsA), ...Object.keys(outputsB)]);
      const outputsChangedKeys = Array.from(allOutputKeys).filter(
        key => JSON.stringify(outputsA[key]) !== JSON.stringify(outputsB[key])
      );
      // Prepare response
      const response = {
        runA: {
          id: runA.id,
          status: runA.status,
          durationMs: runA.durationMs,
          inputs: runA.inputJson,
          outputs: runA.outputRefs,
          trace: runA.trace,
          error: runA.error,
          createdAt: runA.createdAt?.toISOString(),
        },
        runB: {
          id: runB.id,
          status: runB.status,
          durationMs: runB.durationMs,
          inputs: runB.inputJson,
          outputs: runB.outputRefs,
          trace: runB.trace,
          error: runB.error,
          createdAt: runB.createdAt?.toISOString(),
        },
        summaryDiff: {
          inputsChangedKeys,
          outputsChangedKeys,
          statusMatch: runA.status === runB.status,
          durationDiff: (runA.durationMs || 0) - (runB.durationMs || 0),
        },
      };
      res.json(response);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);
export default router;