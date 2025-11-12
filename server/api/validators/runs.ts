import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

/**
 * Run Validators
 */

export const createRunSchema = z.object({
  inputJson: z.record(z.any()),
  versionId: z.string().uuid().optional(), // Optional: use specific version, else use latest published
  options: z.object({
    debug: z.boolean().optional(),
  }).optional(),
});

// Stage 8: Enhanced list query with filters
export const listRunsQuerySchema = paginationQuerySchema.extend({
  workflowId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(), // Stage 8: Filter by project
  status: z.enum(['pending', 'success', 'error']).optional(), // Stage 8: Filter by status
  from: z.string().datetime().optional(), // Stage 8: Date range start
  to: z.string().datetime().optional(), // Stage 8: Date range end
  q: z.string().optional(), // Stage 8: Search query (runId, createdBy, input JSON)
});

export const listRunLogsQuerySchema = paginationQuerySchema;

export const downloadRunQuerySchema = z.object({
  type: z.enum(['docx', 'pdf']).default('docx'),
});

export const runParamsSchema = z.object({
  id: z.string().uuid(),
});

export const workflowIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// Stage 8: Rerun schema
export const rerunSchema = z.object({
  overrideInputJson: z.record(z.any()).optional(),
  versionId: z.string().uuid().optional(), // Use different version
  options: z.object({
    debug: z.boolean().optional(),
  }).optional(),
});

// Stage 8: Export query schema
export const exportRunsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  workflowId: z.string().uuid().optional(),
  status: z.enum(['pending', 'success', 'error']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().optional(),
});

// Stage 8: Compare query schema
export const compareRunsQuerySchema = z.object({
  runA: z.string().uuid(),
  runB: z.string().uuid(),
});

// Response types
export type CreateRunRequest = z.infer<typeof createRunSchema>;
export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;
export type ListRunLogsQuery = z.infer<typeof listRunLogsQuerySchema>;
export type DownloadRunQuery = z.infer<typeof downloadRunQuerySchema>;
export type RunParams = z.infer<typeof runParamsSchema>;
export type WorkflowIdParams = z.infer<typeof workflowIdParamsSchema>;
export type RerunRequest = z.infer<typeof rerunSchema>; // Stage 8
export type ExportRunsQuery = z.infer<typeof exportRunsQuerySchema>; // Stage 8
export type CompareRunsQuery = z.infer<typeof compareRunsQuerySchema>; // Stage 8

// Run response shapes
export interface CreateRunResponse {
  runId: string;
  status: 'pending' | 'success' | 'error';
  outputRefs?: Record<string, any>;
  logs?: Array<{
    level: 'info' | 'warn' | 'error';
    message: string;
    timestamp: string;
  }>;
  durationMs?: number;
}

export interface RunLogEntry {
  id: string;
  runId: string;
  nodeId: string | null;
  level: 'info' | 'warn' | 'error';
  message: string;
  context: Record<string, any> | null;
  createdAt: string;
}
