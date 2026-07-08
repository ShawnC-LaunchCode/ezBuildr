import { URL } from "url";
import dns from "dns/promises";
export const isInternalIp = (ip: string): boolean => {
    // IPv4 private ranges
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.)/.test(ip)) {
        return true;
    }
    // IPv6 local/private ranges
    return /^([fF][cCdD]|fe80|::1)/.test(ip);
};

/**
 * Validates a URL for SSRF protection.
 * Checks scheme (https), and resolves hostname to ensure it does not point to internal/reserved IPs.
 * 
 * @param targetUrl The URL to validate
 * @param allowHttp Whether to allow http scheme (default false, usually for dev only)
 * @returns true if safe, throws Error or returns false if unsafe
 */
export async function validateSafeUrl(targetUrl: string, allowedProtocols = ["https:"]): Promise<boolean> {
    // NOTE: no environment-based bypasses here. Tests that need permissive
    // URL validation must mock this module (vi.mock('.../ssrfValidator')) —
    // security code must not change behavior based on NODE_ENV.
    try {
        const parsed = new URL(targetUrl);

        if (!allowedProtocols.includes(parsed.protocol)) {
            return false;
        }

        // Loopback / simple string checks
        // SEC-014: Gate loopback usage behind explicit env var
        if (
            ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname) &&
            process.env.ALLOW_LOCALHOST_WEBHOOKS !== "true"
        ) {
            return false;
        }

        // DNS resolution to catch DNS rebinding to internal IPs
        const addresses = await dns.resolve(parsed.hostname);

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
