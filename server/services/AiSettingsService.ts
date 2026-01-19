import { eq } from "drizzle-orm";
import { aiSettings } from "@shared/schema"; // Updated import path based on project structure
import { db } from "../db";
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
Available operation types:
- workflow.setMetadata
- section.create/update/delete/reorder
- step.create/update/delete/move/setVisibleIf/setRequired
- logicRule.create/update/delete (stub)
- document.add/update/setConditional/bindFields (stub)
- datavault.createTable/addColumns/createWritebackMapping (stub)`;
export class AiSettingsService {
    /**
     * Get the effective system prompt based on hierarchy:
     * 1. User override (future)
     * 2. Org override (future)
     * 3. Global settings
     * 4. Hardcoded fallback
     */
    async getEffectivePrompt({ userId, orgId }: { userId?: string; orgId?: string }): Promise<string> {
        // For now, simple implementation: just get Global
        const globalSettings = await this.getGlobalSettings();
        if (globalSettings?.systemPrompt) {
            return globalSettings.systemPrompt;
        }
        return DEFAULT_SYSTEM_PROMPT;
    }
    /**
     * Get global AI settings
     */
    async getGlobalSettings() {
        return db.query.aiSettings.findFirst({
            where: eq(aiSettings.scope, "global"),
        });
    }
    /**
     * Update global system prompt
     */
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