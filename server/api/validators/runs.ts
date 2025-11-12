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

export const listRunsQuerySchema = paginationQuerySchema.extend({
  workflowId: z.string().uuid().optional(),
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

// Response types
export type CreateRunRequest = z.infer<typeof createRunSchema>;
export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;
export type ListRunLogsQuery = z.infer<typeof listRunLogsQuerySchema>;
export type DownloadRunQuery = z.infer<typeof downloadRunQuerySchema>;
export type RunParams = z.infer<typeof runParamsSchema>;
export type WorkflowIdParams = z.infer<typeof workflowIdParamsSchema>;

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
