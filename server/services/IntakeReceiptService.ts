import type { Workflow } from "@shared/schema";

import { createLogger } from "../logger";
import { stepRepository, stepValueRepository } from "../repositories";

import { sendIntakeReceipt } from "./emailService";

import type { IntakeConfig } from "../../shared/types/intake";



const logger = createLogger({ module: "intake-receipt-service" });

export interface ReceiptResult {
    attempted: boolean;
    to?: string;
    success: boolean;
    error?: string;
}

export class IntakeReceiptService {
    /**
     * Send an intake receipt email if configured
     */
    async sendReceipt(
        runId: string,
        workflow: Workflow,
        intakeConfig: IntakeConfig
    ): Promise<ReceiptResult> {
        // Check if receipt is enabled and email variable is configured
        if (!intakeConfig.sendEmailReceipt || !intakeConfig.receiptEmailVar) {
            return { attempted: false, success: false };
        }

        try {
            // Fetch data for email receipt
            const allSteps = await stepRepository.findByWorkflowIdWithAliases(workflow.id);
            const stepValues = await stepValueRepository.findByRunId(runId);

            // Create Map for efficient lookups
            const stepMap = new Map(allSteps.map((s: any) => [s.id, s]));
            const emailStep = allSteps.find((s: any) => s.alias === intakeConfig.receiptEmailVar);

            if (!emailStep) {
                logger.warn({ runId, receiptEmailVar: intakeConfig.receiptEmailVar }, "Email field alias not found in workflow");
                return { attempted: true, success: false, error: "Email field alias not found" };
            }

            const emailValue = stepValues.find(sv => sv.stepId === emailStep.id);

            if (!emailValue || typeof emailValue.value !== "string") {
                logger.warn({ runId, receiptEmailVar: intakeConfig.receiptEmailVar }, "Email field value not found or invalid");
                return { attempted: true, success: false, error: "Email field value invalid" };
            }

            const email = emailValue.value;

            // Build summary (non-sensitive fields only)
            const summary: Record<string, any> = {};
            const excludeList = intakeConfig.excludeFromReceipt || [];

            for (const stepValue of stepValues) {
                const step = stepMap.get(stepValue.stepId);
                if (step?.alias && !this.isSensitiveField(step.alias as string, excludeList)) {
                    summary[step.alias] = stepValue.value;
                }
            }

            // Send receipt
            const emailResult = await sendIntakeReceipt({
                to: email,
                tenantId: workflow.projectId || "default",
                workflowId: workflow.id,
                workflowName: workflow.title,
                runId: runId,
                summary,
            });

            if (emailResult.success) {
                logger.info({ runId, email }, "Sent intake receipt");
            } else {
                logger.error({ runId, email, error: emailResult.error }, "Failed to send intake receipt");
            }

            return {
                attempted: true,
                to: email,
                success: emailResult.success,
                error: emailResult.error,
            };

        } catch (emailError: any) {
            // Catch email logic errors so we don't fail the submission
            logger.error({
                error: emailError,
                message: emailError.message,
                runId
            }, "Critical error in intake email receipt logic");

            return {
                attempted: true,
                success: false,
                error: "Internal error sending receipt"
            };
        }
    }

    /**
     * Check if a field name is sensitive (should not be included in email)
     * Checks against default sensitive keywords AND custom exclude list
     */
    private isSensitiveField(fieldName: string, excludeList: string[] = []): boolean {
        const lowerName = fieldName.toLowerCase();

        // 1. Check custom exclude list (exact match or alias)
        if (excludeList.some(excluded => lowerName === excluded.toLowerCase())) {
            return true;
        }

        // 2. Check default sensitive keywords
        const sensitiveKeywords = [
            "password", "ssn", "social_security", "credit_card", "cvv",
            "secret", "token", "api_key", "auth_code", "pin_code"
        ];

        return sensitiveKeywords.some(keyword => lowerName.includes(keyword));
    }
}

export const intakeReceiptService = new IntakeReceiptService();
