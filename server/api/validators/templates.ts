import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

/**
 * Template Validators
 */

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  // File upload handled separately via multipart/form-data
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  // File replacement handled separately via multipart/form-data
});

export const listTemplatesQuerySchema = paginationQuerySchema;

export const templateParamsSchema = z.object({
  id: z.string().uuid(),
});

export const projectIdParamsSchema = z.object({
  projectId: z.string().uuid(),
});

// Response types
export type CreateTemplateRequest = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateRequest = z.infer<typeof updateTemplateSchema>;
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;
export type TemplateParams = z.infer<typeof templateParamsSchema>;
export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;

// Placeholder response
export interface PlaceholderInfo {
  name: string;
  type: 'text' | 'image' | 'list';
  example?: string;
}

export interface ExtractPlaceholdersResponse {
  templateId: string;
  placeholders: PlaceholderInfo[];
}
