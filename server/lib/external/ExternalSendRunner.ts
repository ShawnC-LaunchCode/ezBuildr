import { getValueByPath } from "@shared/conditionEvaluator";
import type { ExternalSendBlockConfig, ExternalSendResult, ExternalDestination, PayloadMapping, BlockContext } from "@shared/types/blocks";
import { createLogger } from "../../logger";
import { externalDestinations } from "@shared/schema"; // Assuming schema access or repository
import { externalDestinationsRepository } from "../../repositories"; // Assuming this will be created or used
import { WebhookAdapter } from "./adapters/WebhookAdapter";
import { DestinationAdapter } from "./interfaces";

const logger = createLogger({ module: "external-send-runner" });

export class ExternalSendRunner {
    private adapters: Record<string, DestinationAdapter> = {};

    constructor() {
        this.adapters["webhook"] = new WebhookAdapter();
    }

    /**
     * Execute an external send operation
     */
    async executeSend(
        config: ExternalSendBlockConfig,
        context: BlockContext,
        isPreview: boolean = false
    ): Promise<ExternalSendResult> {
        // 1. Fetch Destination Config
        // TODO: Repository call. For now assuming we have a way to get it.
        // We'll need `externalDestinationsRepository`. If it doesn't exist, we might need to query `db` directly or add repo.
        // Let's assume a simple DB lookup or repo method.
        let destination: ExternalDestination | null = null;
        try {
            // Placeholder for repository access
            destination = await this.getDestination(config.destinationId);
        } catch (e) {
            logger.error({ error: e, destinationId: config.destinationId }, "Failed to load destination");
            return {
                success: false,
                destinationId: config.destinationId,
                error: "Destination lookup failed"
            };
        }

        if (!destination) {
            return {
                success: false,
                destinationId: config.destinationId,
                error: "Destination not found"
            };
        }

        logger.info({
            operation: "external_send_start",
            type: destination.type,
            destinationId: destination.id,
            preview: isPreview
        }, "Starting external send");

        // 2. Resolve Payload
        const payload: Record<string, any> = {};
        for (const mapping of config.payloadMappings) {
            const val = this.resolveValue(mapping.value, context.data);
            this.assignNested(payload, mapping.key, val);
        }

        // 3. Resolve Headers
        const headers: Record<string, string> = {};
        if (config.headers) {
            for (const mapping of config.headers) {
                const val = this.resolveValue(mapping.value, context.data);
                if (val !== null && val !== undefined) {
                    headers[mapping.key] = String(val);
                }
            }
        }

        // 4. Preview Safety Rule
        if (isPreview) {
            logger.info({
                operation: "external_send_preview_skipped",
                destinationType: destination.type,
                payloadPreview: payload
            }, "Skipping external send in preview mode");

            return {
                success: true,
                destinationId: config.destinationId,
                responseSnippet: "Skipped in Preview Mode",
                statusCode: 200 // Synthetic success
            };
        }

        // 5. Select Adapter & Execute
        const adapter = this.adapters[destination.type];
        if (!adapter) {
            return {
                success: false,
                destinationId: config.destinationId,
                error: `No adapter found for destination type: ${destination.type}`
            };
        }

        try {
            return await adapter.send(destination.config, payload, headers, context);
        } catch (error) {
            logger.error({ error, destinationId: destination.id }, "Adapter execution failed");
            return {
                success: false,
                destinationId: config.destinationId,
                error: error instanceof Error ? error.message : "Unknown error during send"
            };
        }
    }

    private resolveValue(expression: string, data: Record<string, any>): any {
        // Simple wrapper around getValueByPath or direct return
        // Similar to WriteRunner logic
        if (!expression) return null;

        let path = expression;
        // Strip curlies if present (simple templating support artifact)
        if (path.startsWith("{{") && path.endsWith("}}")) {
            path = path.slice(2, -2).trim();
        }

        const val = getValueByPath(data, path);
        if (val !== undefined) return val;

        // Fallback: If looks like var, return null, else return literal
        if (expression.includes("{{")) return null;
        return expression;
    }

    private assignNested(obj: any, keyPath: string, value: any) {
        const parts = keyPath.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current[part]) current[part] = {};
            current = current[part];
        }
        current[parts[parts.length - 1]] = value;
    }

    private async getDestination(id: string): Promise<ExternalDestination | null> {
        return await externalDestinationsRepository.findById(id);
    }
}

export const externalSendRunner = new ExternalSendRunner();
