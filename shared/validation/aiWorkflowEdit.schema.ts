import { z } from "zod";

import { conditionExpressionSchema } from "../types/conditions";

/**
 * AI Workflow Edit Schemas
 * Defines the contract between frontend and AI-powered workflow editing system
 */

// ============================================================================
// Preferences
// ============================================================================

export const aiPreferencesSchema = z.object({
  readingLevel: z.enum(["simple", "standard", "professional"]).optional(),
  interviewerRole: z.string().max(50).regex(/^[a-zA-Z0-9 -]+$/).optional(),
  tone: z.enum(["friendly", "neutral", "formal"]).optional(),
  dropdownThreshold: z.number().min(1).max(20).optional(),
}).optional();

// ============================================================================
// Questions (for AI to ask user during editing)
// ============================================================================

export const aiQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  type: z.enum(["text", "single_select", "multi_select", "number"]),
  options: z.array(z.string()).optional(),
  blocking: z.boolean().default(false), // If true, AI cannot proceed without answer
});

// ============================================================================
// Patch Operations (Atomic Changes)
// ============================================================================

export const workflowPatchOpSchema = z.discriminatedUnion("op", [
  // Workflow metadata
  z.object({
    op: z.literal("workflow.setMetadata"),
    title: z.string().optional(),
    description: z.string().optional(),
  }),

  // Page operations
  z.object({
    op: z.literal("page.create"),
    tempId: z.string().optional(),
    title: z.string(),
    order: z.number(),
    config: z.record(z.unknown()).optional(),
  }),
  z.object({
    op: z.literal("page.update"),
    id: z.string().optional(), // Real ID
    tempId: z.string().optional(), // Or tempId reference
    title: z.string().optional(),
    order: z.number().optional(),
    config: z.record(z.unknown()).optional(),
  }),
  z.object({
    op: z.literal("page.delete"),
    id: z.string().optional(),
    tempId: z.string().optional(),
  }),
  z.object({
    op: z.literal("page.reorder"),
    pageIds: z.array(z.string()),
  }),
  z.object({
    op: z.literal("page.setVisibleIf"),
    id: z.string().optional(),
    tempId: z.string().optional(),
    visibleIf: conditionExpressionSchema,
  }),

  // Step operations
  z.object({
    op: z.literal("step.create"),
    tempId: z.string().optional(),
    pageId: z.string().optional(),
    pageRef: z.string().optional(), // Reference to page tempId
    type: z.string(),
    title: z.string(),
    alias: z.string().optional(),
    required: z.boolean().optional(),
    order: z.number().optional(),
    config: z.record(z.unknown()).optional(),
    defaultValue: z.unknown().optional(),
  }),
  z.object({
    op: z.literal("step.update"),
    id: z.string().optional(),
    tempId: z.string().optional(),
    type: z.string().optional(),
    title: z.string().optional(),
    alias: z.string().optional(),
    required: z.boolean().optional(),
    config: z.record(z.unknown()).optional(),
    // `visibleIf` is a jsonb ConditionExpression, never a string — typing it as
    // a string meant the model was taught (and validated against) a shape the
    // engine cannot evaluate (ICW2-12).
    visibleIf: conditionExpressionSchema.optional(),
    defaultValue: z.unknown().optional(),
  }),
  z.object({
    op: z.literal("step.delete"),
    id: z.string().optional(),
    tempId: z.string().optional(),
  }),
  z.object({
    op: z.literal("step.move"),
    id: z.string().optional(),
    tempId: z.string().optional(),
    toPageId: z.string(),
    order: z.number().optional(),
  }),
  z.object({
    op: z.literal("step.setVisibleIf"),
    id: z.string().optional(),
    tempId: z.string().optional(),
    visibleIf: conditionExpressionSchema,
  }),
  z.object({
    op: z.literal("step.reorder"),
    pageId: z.string(),
    stepIds: z.array(z.string()),
  }),
  z.object({
    op: z.literal("step.setRequired"),
    id: z.string().optional(),
    tempId: z.string().optional(),
    required: z.boolean(),
  }),

  // Logic rule operations
  z.object({
    op: z.literal("logicRule.create"),
    rule: z.object({
      condition: z.string(),
      action: z.string(),
      target: z.object({
        type: z.enum(["page", "step"]),
        id: z.string().optional(),
        tempId: z.string().optional(),
      }),
    }),
  }),
  z.object({
    op: z.literal("logicRule.update"),
    id: z.string(),
    rule: z.object({
      condition: z.string().optional(),
      action: z.string().optional(),
      target: z.object({
        type: z.enum(["page", "step"]),
        id: z.string().optional(),
        tempId: z.string().optional(),
      }).optional(),
    }),
  }),
  z.object({
    op: z.literal("logicRule.delete"),
    id: z.string(),
  }),

  // Document operations
  z.object({
    op: z.literal("document.add"),
    tempId: z.string().optional(),
    name: z.string(),
    fileType: z.enum(["pdf", "docx"]),
    template: z.string(), // Template content or reference
  }),
  z.object({
    op: z.literal("document.update"),
    id: z.string().optional(),
    tempId: z.string().optional(),
    name: z.string().optional(),
    template: z.string().optional(),
  }),
  z.object({
    op: z.literal("document.setConditional"),
    id: z.string().optional(),
    tempId: z.string().optional(),
    condition: z.string().nullable(),
  }),
  z.object({
    op: z.literal("document.bindFields"),
    id: z.string().optional(),
    tempId: z.string().optional(),
    bindings: z.record(z.string()), // Field name -> step alias mapping
  }),

  // DataVault operations (safe only)
  z.object({
    op: z.literal("datavault.createTable"),
    tempId: z.string().optional(),
    databaseId: z.string(),
    name: z.string(),
    columns: z.array(z.object({
      name: z.string(),
      type: z.enum(["text", "number", "date", "boolean", "select", "multiselect"]),
      config: z.record(z.unknown()).optional(),
    })),
  }),
  z.object({
    op: z.literal("datavault.addColumns"),
    tableId: z.string(),
    columns: z.array(z.object({
      name: z.string(),
      type: z.enum(["text", "number", "date", "boolean", "select", "multiselect"]),
      config: z.record(z.unknown()).optional(),
    })),
  }),
]);

export type WorkflowPatchOp = z.infer<typeof workflowPatchOpSchema>;

// ============================================================================
// AI Response from Model
// ============================================================================

export const aiModelResponseSchema = z.object({
  summary: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  questions: z.array(aiQuestionSchema).optional(),
  warnings: z.array(z.string()).optional(),
  ops: z.array(workflowPatchOpSchema),
});

export type AiModelResponse = z.infer<typeof aiModelResponseSchema>;

// ============================================================================
// Request/Response for API Endpoint
// ============================================================================

/**
 * The edit endpoint serves three modes, discriminated by which optional fields
 * are present (ICW2-10):
 *
 * - **propose** (`dryRun: true`): generate ops from `userMessage` and return
 *   them with a diff. Nothing is written — no snapshot, no version, no rows.
 * - **apply** (`ops` present): skip the model entirely and apply caller-supplied
 *   ops through the snapshot + transaction pipeline. Ops are re-validated
 *   per-op with the same IDOR checks as generated ops, so echoing a proposal
 *   back is no more privileged than any other authorized write.
 * - **generate-and-apply** (neither): the original one-shot path, used by
 *   easy-mode auto-apply.
 */
export const aiWorkflowEditRequestSchema = z.object({
  // Required only when the model is being called; an apply request carries ops.
  userMessage: z.string().min(1).max(2000).optional(),
  workflowId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).optional(),
  preferences: aiPreferencesSchema,
  conversationState: z.record(z.unknown()).optional(),
  dryRun: z.boolean().optional(),
  ops: z.array(workflowPatchOpSchema).optional(),
}).refine(
  (data) => data.ops !== undefined || (data.userMessage !== undefined && data.userMessage.length > 0),
  { message: "userMessage is required unless ops are supplied", path: ["userMessage"] },
).refine(
  (data) => !(data.dryRun === true && data.ops !== undefined),
  { message: "dryRun cannot be combined with ops", path: ["dryRun"] },
);

export type AiWorkflowEditRequest = z.infer<typeof aiWorkflowEditRequestSchema>;

// ============================================================================
// Proposal (dry-run) response
// ============================================================================

export const aiEditChangeSchema = z.object({
  type: z.enum(["add", "remove", "update", "move"]),
  entity: z.enum(["workflow", "page", "step", "logic", "document", "datavault"]),
  explanation: z.string(),
});

export type AiEditChange = z.infer<typeof aiEditChangeSchema>;

export const aiEditProposalSchema = z.object({
  ops: z.array(workflowPatchOpSchema),
  changes: z.array(aiEditChangeSchema),
  summary: z.array(z.string()),
  confidence: z.number(),
  warnings: z.array(z.string()).optional(),
  questions: z.array(aiQuestionSchema).optional(),
});

export type AiEditProposal = z.infer<typeof aiEditProposalSchema>;

export const aiWorkflowEditResponseSchema = z.object({
  workflow: z.unknown(), // ApiWorkflow type (full workflow object)
  versionId: z.string().uuid().nullable(),
  summary: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
  questions: z.array(aiQuestionSchema).optional(),
  confidence: z.number(),
  diff: z.unknown().optional(), // DiffResult type
  noChanges: z.boolean().optional(), // True if no ops were applied
});

export type AiWorkflowEditResponse = z.infer<typeof aiWorkflowEditResponseSchema>;
