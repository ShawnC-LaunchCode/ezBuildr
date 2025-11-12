import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

/**
 * Workflow Validators
 */

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  graphJson: z.record(z.any()).optional(), // Initial graph structure
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  graphJson: z.record(z.any()).optional(),
});

export const publishWorkflowSchema = z.object({
  // Optional fields for publish operation
  notes: z.string().max(1000).optional(),
});

export const listWorkflowsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['draft', 'published']).optional(),
  q: z.string().max(255).optional(), // Search query
});

export const listVersionsQuerySchema = paginationQuerySchema;

export const workflowParamsSchema = z.object({
  id: z.string().uuid(),
});

export const projectIdParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export const versionIdParamsSchema = z.object({
  versionId: z.string().uuid(),
});

// Response types
export type CreateWorkflowRequest = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowRequest = z.infer<typeof updateWorkflowSchema>;
export type PublishWorkflowRequest = z.infer<typeof publishWorkflowSchema>;
export type ListWorkflowsQuery = z.infer<typeof listWorkflowsQuerySchema>;
export type ListVersionsQuery = z.infer<typeof listVersionsQuerySchema>;
export type WorkflowParams = z.infer<typeof workflowParamsSchema>;
export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type VersionIdParams = z.infer<typeof versionIdParamsSchema>;
