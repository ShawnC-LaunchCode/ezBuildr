
import { z } from "zod";

/**
 * Zod Schema for IntakeConfig (stored in workflows.intakeConfig)
 * Matches interface in shared/types/intake.ts
 */
export const IntakeConfigSchema = z.object({
    // URL-based Prefill
    allowPrefill: z.boolean().optional(),
    allowedPrefillKeys: z.array(z.string()).optional(),

    // CAPTCHA / Anti-bot
    requireCaptcha: z.boolean().optional(),
    captchaType: z.enum(["simple", "recaptcha"]).optional(),

    // Email Receipts
    sendEmailReceipt: z.boolean().optional(),
    receiptEmailVar: z.string().optional(),
    receiptTemplateId: z.string().optional(),
    excludeFromReceipt: z.array(z.string()).optional(),
}).strict(); // Do not allow unknown keys to ensure schema purity

export type IntakeConfig = z.infer<typeof IntakeConfigSchema>;

/**
 * Zod Schema for Workflow Graph (stored in workflowVersions.graphJson)
 * Matches interface in shared/types/workflow.ts
 */

const WorkflowBlockSchema = z.object({
    id: z.string(),
    type: z.string(), // Allow string to be flexible with legacy/new types
    title: z.string().optional(),
    config: z.record(z.any()).optional(),
    variableName: z.string().optional(),
    visibleIf: z.any().optional(),
    required: z.boolean().optional(),
    // Allow other props
}).passthrough();

const WorkflowPageSchema = z.object({
    id: z.string(),
    title: z.string(),
    blocks: z.array(WorkflowBlockSchema),
    order: z.number(),
    slug: z.string().optional(),
});

export const WorkflowGraphSchema = z.object({
    id: z.string(),
    title: z.string(),
    pages: z.array(WorkflowPageSchema),
    global: z.record(z.any()).optional(),
}).passthrough();

export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
