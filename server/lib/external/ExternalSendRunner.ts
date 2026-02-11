
import { externalDestinationService } from "../../services/ExternalDestinationService";
import type { ExternalSendBlockConfig, BlockContext } from "@shared/types/blocks";
import { logger } from "../../logger";
import { resolvePayloadMappings } from "../shared/variableResolver";

export interface ExternalSendResult {
    success: boolean;
    statusCode?: number;
    responseBody?: unknown;
    error?: string;
    simulated?: boolean;
}

export class ExternalSendRunner {

    /**
     * SECURITY: Validate URL to prevent SSRF attacks
     * Blocks requests to internal/private IP ranges and localhost
     */
    private validateUrl(url: string): { valid: boolean; error?: string } {
        try {
            const parsedUrl = new URL(url);

            // Only allow HTTP/HTTPS protocols
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
            }

            const hostname = parsedUrl.hostname.toLowerCase();

            // Block localhost and loopback addresses
            if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
                return { valid: false, error: 'Requests to localhost are not allowed' };
            }

            // Block internal IP ranges (RFC 1918 private networks)
            const internalPatterns = [
                /^10\./,                    // 10.0.0.0/8
                /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
                /^192\.168\./,              // 192.168.0.0/16
                /^169\.254\./,              // 169.254.0.0/16 (link-local)
                /^fc00:/,                   // IPv6 private
                /^fe80:/,                   // IPv6 link-local
            ];

            for (const pattern of internalPatterns) {
                if (pattern.test(hostname)) {
                    return { valid: false, error: 'Requests to internal IP addresses are not allowed' };
                }
            }

            return { valid: true };
        } catch (e) {
            return { valid: false, error: 'Invalid URL format' };
        }
    }

    /**
     * Execute or simulate an external send
     */
    async execute(
        config: ExternalSendBlockConfig,
        context: BlockContext,
        tenantId: string,
        mode: 'preview' | 'live' = 'live'
    ): Promise<ExternalSendResult> {

        // 1. Resolve Payload using shared variable resolver
        // This now supports {{variable}} syntax, dot notation, and alias resolution
        const payload = resolvePayloadMappings(config.payloadMappings, context.data, context.aliasMap);

        // 2. Fetch Destination Config
        const destination = await externalDestinationService.getDestination(config.destinationId, tenantId);
        if (!destination) {
            return { success: false, error: `Destination not found: ${config.destinationId}` };
        }

        const destConfig = destination.config as { url: string; method?: string; headers?: Record<string, string> };

        // SECURITY FIX: Validate URL to prevent SSRF attacks
        const urlValidation = this.validateUrl(destConfig.url);
        if (!urlValidation.valid) {
            logger.warn({ url: destConfig.url, error: urlValidation.error }, 'Blocked SSRF attempt');
            return { success: false, error: `Security: ${urlValidation.error}` };
        }

        // 3. Preview Mode: Simulate
        if (mode === 'preview') {
            logger.info({
                msg: "Simulating External Send",
                destination: destination.name,
                payload
            });
            return {
                success: true,
                simulated: true,
                responseBody: { message: "Simulated success", payload }
            };
        }

        // 4. Live Mode: Execute
        try {
            // SECURITY FIX: Add timeout to prevent resource exhaustion
            const TIMEOUT_MS = 30000; // 30 seconds
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

            try {
                const response = await fetch(destConfig.url, {
                    method: destConfig.method ?? 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(destConfig.headers ?? {})
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                    // Prevent following redirects to internal IPs
                    redirect: 'manual'
                });

                clearTimeout(timeoutId);

                const responseText = await response.text();
                let responseBody;
                try {
                    responseBody = JSON.parse(responseText);
                } catch (e) {
                    responseBody = responseText;
                }

                const success = response.ok;

                logger.info({
                    msg: "External Send Completed",
                    destination: destination.name,
                    success,
                    status: response.status
                });

                return {
                    success,
                    statusCode: response.status,
                    responseBody
                };
            } catch (fetchError) {
                clearTimeout(timeoutId);

                // Handle timeout specifically
                if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                    logger.error({
                        msg: "External Send Timeout",
                        destination: destination.name,
                        timeout: TIMEOUT_MS
                    });
                    return {
                        success: false,
                        error: `Request timeout after ${TIMEOUT_MS}ms`
                    };
                }

                throw fetchError; // Re-throw to outer catch
            }
        } catch (error) {
            logger.error({
                msg: "External Send Failed",
                destination: destination.name,
                error
            });
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown network error"
            };
        }
    }
}

export const externalSendRunner = new ExternalSendRunner();
