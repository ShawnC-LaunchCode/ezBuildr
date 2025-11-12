import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

/**
 * Workflow Validators
 * Stage 5: Added support for conditional execution
 */

// Conditional execution configuration
const conditionalConfigSchema = z.object({
  condition: z.string().optional(),
  skipBehavior: z.enum(['skip', 'hide', 'disable']).optional(),
});

// Node configuration schemas
const questionNodeConfigSchema = z.object({
  key: z.string(),
  questionText: z.string(),
  questionType: z.enum(['text', 'number', 'boolean', 'select', 'multiselect']),
  required: z.boolean().optional(),
  options: z.array(z.object({
    value: z.any(),
    label: z.string(),
  })).optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
  }).optional(),
}).merge(conditionalConfigSchema);

const computeNodeConfigSchema = z.object({
  outputKey: z.string(),
  expression: z.string(),
}).merge(conditionalConfigSchema);

const branchNodeConfigSchema = z.object({
  branches: z.array(z.object({
    condition: z.string(),
    targetNodeId: z.string().optional(),
  })),
  defaultTargetNodeId: z.string().optional(),
}).merge(conditionalConfigSchema);

const templateNodeConfigSchema = z.object({
  templateId: z.string(),
  bindings: z.record(z.string()),
  outputName: z.string().optional(),
}).merge(conditionalConfigSchema);

// Node schema
const nodeSchema = z.object({
  id: z.string(),
  type: z.enum(['question', 'compute', 'branch', 'template']),
  config: z.union([
    questionNodeConfigSchema,
    computeNodeConfigSchema,
    branchNodeConfigSchema,
    templateNodeConfigSchema,
  ]),
});

// Edge schema
const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
});

// Graph JSON schema
const graphJsonSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema).optional(),
  startNodeId: z.string().optional(),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  graphJson: graphJsonSchema.optional(), // Initial graph structure
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  graphJson: graphJsonSchema.optional(),
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
