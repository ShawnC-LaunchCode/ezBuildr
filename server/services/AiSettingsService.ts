import { eq } from "drizzle-orm";

import { buildWorkflowVocabulary } from "@shared/aiVocabulary";
import { aiSettings } from "@shared/schema"; // Updated import path based on project structure

import { db } from "../db";

/**
 * The operation, step-type, and operator catalogs below are generated from the
 * platform's own enums and schemas at module load (ICW2-12) — adding a step
 * type or an op teaches the model automatically, with no edit here.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are an expert {{interviewerRole}} helping to build and refine workflow automation systems.
Your task is to analyze the user's request and generate structured operations to modify the workflow.
Guidelines:
- Reading level: {{readingLevel}}
- Tone: {{tone}}
- Generate clear, concise operation steps
- Avoid destructive DataVault operations (no table/column drops, no data deletion)
- Use tempId for new entities that might be referenced by other ops in the same batch
- Provide confidence score based on request clarity
- Ask questions if requirements are ambiguous
- Include warnings for potentially breaking changes
- Always set a step "config" when the type takes one (a choice step with no
  options is unusable)

${buildWorkflowVocabulary()}`;
export class AiSettingsService {
    /**
     * Get the effective system prompt: the global override if configured,
     * otherwise the hardcoded default.
     *
     * NOTE: per-user / per-org overrides are not implemented. Re-add scoping
     * params here when that feature is scheduled (ICW-15).
     */
    async getEffectivePrompt(): Promise<string> {
        const globalSettings = await this.getGlobalSettings();
        if (globalSettings?.systemPrompt) {
            return globalSettings.systemPrompt;
        }
        return DEFAULT_SYSTEM_PROMPT;
    }
    /**
     * Get global AI settings
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async getGlobalSettings() {
        return db.query.aiSettings.findFirst({
            where: eq(aiSettings.scope, "global"),
        });
    }
    /**
     * Update global system prompt
     */
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async updateGlobalSettings(systemPrompt: string, userId: string) {
        // Check if global settings exist
        const existing = await this.getGlobalSettings();
        if (existing) {
            return db
                .update(aiSettings)
                .set({
                    systemPrompt,
                    updatedBy: userId,
                    updatedAt: new Date(),
                })
                .where(eq(aiSettings.id, existing.id))
                .returning();
        } else {
            return db
                .insert(aiSettings)
                .values({
                    scope: "global",
                    systemPrompt,
                    updatedBy: userId,
                })
                .returning();
        }
    }
}
export const aiSettingsService = new AiSettingsService();