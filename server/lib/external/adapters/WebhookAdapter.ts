import { BlockContext, ExternalSendResult } from "@shared/types/blocks";
import { DestinationAdapter } from "../interfaces";
import { createLogger } from "../../../logger";

const logger = createLogger({ module: "webhook-adapter" });

export class WebhookAdapter implements DestinationAdapter {
    async send(config: Record<string, any>, payload: any, headers: Record<string, string>, context: BlockContext): Promise<ExternalSendResult> {
        // Config: { url, method, auth: { type, token, username, password } }
        const url = config.url;
        const method = config.method || "POST";

        if (!url) {
            throw new Error("Webhook URL is missing in configuration");
        }

        const fetchHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            ...headers
        };

        // Auth injection
        if (config.auth) {
            if (config.auth.type === "bearer" && config.auth.token) {
                fetchHeaders["Authorization"] = `Bearer ${config.auth.token}`;
            } else if (config.auth.type === "basic" && config.auth.username && config.auth.password) {
                const b64 = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString("base64");
                fetchHeaders["Authorization"] = `Basic ${b64}`;
            }
        }

        logger.info({ url, method }, "Sending webhook");

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch(url, {
                method,
                headers: fetchHeaders,
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const success = response.ok;
            const snippet = await response.text();

            return {
                success,
                destinationId: "unknown", // Runner should override
                statusCode: response.status,
                responseSnippet: snippet.slice(0, 500) // Truncate
            };

        } catch (error) {
            return {
                success: false,
                destinationId: "unknown",
                error: error instanceof Error ? error.message : "Network error"
            };
        }
    }
}
