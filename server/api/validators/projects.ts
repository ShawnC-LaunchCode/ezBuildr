import { z } from 'zod';

import { paginationQuerySchema } from '../../utils/pagination';

/**
 * Project Validators
 */

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional().nullable(),
});

export const listProjectsQuerySchema = paginationQuerySchema;

export const projectParamsSchema = z.object({
  id: z.string().uuid(),
});

// Response types
export type CreateProjectRequest = z.infer<typeof createProjectSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type ProjectParams = z.infer<typeof projectParamsSchema>;
