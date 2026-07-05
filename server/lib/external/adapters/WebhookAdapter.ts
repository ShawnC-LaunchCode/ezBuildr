import { BlockContext, ExternalSendResult } from "@shared/types/blocks";
import { DestinationAdapter } from "../interfaces";
import { createLogger } from "../../../logger";
import { assertOutboundUrlAllowed } from "../../security/ssrfGuard";

const logger = createLogger({ module: "webhook-adapter" });

export class WebhookAdapter implements DestinationAdapter {
    async send(config: Record<string, unknown>, payload: unknown, headers: Record<string, string>, _context: BlockContext): Promise<ExternalSendResult> {
        const url = config.url as string | undefined;
        const method = (config.method as string) ?? "POST";

        if (!url) {
            throw new Error("Webhook URL is missing in configuration");
        }

        const fetchHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            ...headers
        };

        // Auth injection
        const auth = config.auth as { type?: string; token?: string; username?: string; password?: string } | undefined;
        if (auth) {
            if (auth.type === "bearer" && auth.token) {
                fetchHeaders["Authorization"] = `Bearer ${auth.token}`;
            } else if (auth.type === "basic" && auth.username && auth.password) {
                const b64 = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
                fetchHeaders["Authorization"] = `Basic ${b64}`;
            }
        }

        logger.info({ url, method }, "Sending webhook");

        try {
            // SECURITY: block SSRF to internal/link-local/metadata addresses.
            await assertOutboundUrlAllowed(url);

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
