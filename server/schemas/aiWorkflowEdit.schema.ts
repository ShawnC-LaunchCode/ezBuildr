import { z } from "zod";

/**
 * AI Workflow Edit Schemas
 * Defines the contract between frontend and AI-powered workflow editing system
 */

// ============================================================================
// Preferences
// ============================================================================

export const aiPreferencesSchema = z.object({
  readingLevel: z.enum(["simple", "standard", "professional"]).optional(),
  interviewerRole: z.string().optional(),
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

  // Section operations
  z.object({
    op: z.literal("section.create"),
    tempId: z.string().optional(),
    title: z.string(),
    order: z.number(),
    config: z.record(z.any()).optional(),
  }),
  z.object({
    op: z.literal("section.update"),
    id: z.string().optional(), // Real ID
    tempId: z.string().optional(), // Or tempId reference
    title: z.string().optional(),
    order: z.number().optional(),
    config: z.record(z.any()).optional(),
  }),
  z.object({
    op: z.literal("section.delete"),
    id: z.string().optional(),
    tempId: z.string().optional(),
  }),
  z.object({
    op: z.literal("section.reorder"),
    sectionIds: z.array(z.string()),
  }),

  // Step operations
  z.object({
    op: z.literal("step.create"),
    tempId: z.string().optional(),
    sectionId: z.string().optional(),
    sectionRef: z.string().optional(), // Reference to section tempId
    type: z.string(),
    title: z.string(),
    alias: z.string().optional(),
    required: z.boolean().optional(),
    order: z.number().optional(),
    config: z.record(z.any()).optional(),
    defaultValue: z.any().optional(),
  }),
  z.object({
    op: z.literal("step.update"),
    id: z.string().optional(),
    tempId: z.string().optional(),
    type: z.string().optional(),
    title: z.string().optional(),
    alias: z.string().optional(),
    required: z.boolean().optional(),
    config: z.record(z.any()).optional(),
    visibleIf: z.string().optional(),
    defaultValue: z.any().optional(),
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
    toSectionId: z.string(),
    order: z.number().optional(),
  }),
  z.object({
    op: z.literal("step.setVisibleIf"),
    id: z.string().optional(),
    tempId: z.string().optional(),
    visibleIf: z.string().nullable(),
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
        type: z.enum(["section", "step"]),
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
        type: z.enum(["section", "step"]),
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
      config: z.record(z.any()).optional(),
    })),
  }),
  z.object({
    op: z.literal("datavault.addColumns"),
    tableId: z.string(),
    columns: z.array(z.object({
      name: z.string(),
      type: z.enum(["text", "number", "date", "boolean", "select", "multiselect"]),
      config: z.record(z.any()).optional(),
    })),
  }),
  z.object({
    op: z.literal("datavault.createWritebackMapping"),
    tableId: z.string(),
    stepId: z.string().optional(),
    stepRef: z.string().optional(),
    columnMappings: z.record(z.string()), // Step alias -> column name
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

export const aiWorkflowEditRequestSchema = z.object({
  userMessage: z.string().min(1),
  workflowId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).optional(),
  preferences: aiPreferencesSchema,
  conversationState: z.record(z.any()).optional(),
});

export type AiWorkflowEditRequest = z.infer<typeof aiWorkflowEditRequestSchema>;

export const aiWorkflowEditResponseSchema = z.object({
  workflow: z.any(), // ApiWorkflow type (full workflow object)
  versionId: z.string().uuid().nullable(),
  summary: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
  questions: z.array(aiQuestionSchema).optional(),
  confidence: z.number(),
  diff: z.any().optional(), // DiffResult type
  noChanges: z.boolean().optional(), // True if no ops were applied
});

export type AiWorkflowEditResponse = z.infer<typeof aiWorkflowEditResponseSchema>;
