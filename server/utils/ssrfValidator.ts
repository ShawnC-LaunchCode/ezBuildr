import { URL } from "url";
import dns from "dns/promises";

/**
 * Validates a URL for SSRF protection.
 * Checks scheme (https), and resolves hostname to ensure it does not point to internal/reserved IPs.
 * 
 * @param targetUrl The URL to validate
 * @param allowHttp Whether to allow http scheme (default false, usually for dev only)
 * @returns true if safe, throws Error or returns false if unsafe
 */
export async function validateSafeUrl(targetUrl: string, allowedProtocols = ["https:"]): Promise<boolean> {
    try {
        const parsed = new URL(targetUrl);

        if (!allowedProtocols.includes(parsed.protocol)) {
            return false;
        }

        // Loopback / simple string checks
        if (["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname)) {
            // SEC-014: Gate loopback usage behind explicit env var
            if (process.env.ALLOW_LOCALHOST_WEBHOOKS !== "true") {
                return false;
            }
        }

        // DNS resolution to catch DNS rebinding to internal IPs
        const addresses = await dns.resolve(parsed.hostname);
        
        const isInternalIp = (ip: string) => {
            // IPv4 private ranges
            if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.)/.test(ip)) {
                return true;
            }
            // IPv6 local/private ranges
            if (/^([fF][cCdD]|fe80|::1)/.test(ip)) {
                return true;
            }
            return false;
        };

        for (const addr of addresses) {
            if (isInternalIp(addr)) {
                return false;
            }
        }

        return true;
    } catch (err) {
        // Parse error or DNS resolve error means invalid/unsafe
        return false;
    }
}
