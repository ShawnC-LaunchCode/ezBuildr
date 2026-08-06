import dns from "dns/promises";
import { isIP } from "node:net";

import { URL } from "url";

type Ipv4RangeCheck = (first: number, second: number) => boolean;

const INTERNAL_IPV4_RANGES: Ipv4RangeCheck[] = [
    (first) => first === 0,
    (first) => first === 10,
    (first) => first === 127,
    (first, second) => first === 100 && second >= 64 && second <= 127,
    (first, second) => first === 169 && second === 254,
    (first, second) => first === 172 && second >= 16 && second <= 31,
    (first, second) => first === 192 && second === 168,
    (first, second) => first === 198 && (second === 18 || second === 19),
    (first) => first >= 224,
];

const INTERNAL_IPV6_EXACT = new Set(['::', '::1']);
const INTERNAL_IPV6_PREFIXES = ['fc', 'fd', 'fe8', 'fe9', 'fea', 'feb'];

export const isInternalIp = (ip: string): boolean => {
    const normalized = ip.toLowerCase();
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    const ipv4 = mappedIpv4 ?? (isIP(normalized) === 4 ? normalized : null);
    if (ipv4) {
        const octets = ipv4.split('.').map(Number);
        const [a = -1, b = -1] = octets;
        return INTERNAL_IPV4_RANGES.some((check) => check(a, b));
    }

    return INTERNAL_IPV6_EXACT.has(normalized) ||
        INTERNAL_IPV6_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

export interface SafeUrlResolution {
    address: string;
    family: 4 | 6;
    parsed: URL;
}

/** Resolve and validate every address once so callers can pin their socket to it. */
export async function resolveSafeUrl(
    targetUrl: string,
    allowedProtocols = ["https:"]
): Promise<SafeUrlResolution | null> {
    try {
        const parsed = new URL(targetUrl);
        if (!allowedProtocols.includes(parsed.protocol)) {
            return null;
        }
        if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname)) {
            return null;
        }

        const addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
        if (addresses.length === 0 || addresses.some(({ address }) => isInternalIp(address))) {
            return null;
        }
        const selected = addresses[0];
        return { parsed, address: selected.address, family: selected.family === 6 ? 6 : 4 };
    } catch {
        return null;
    }
}

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
    return (await resolveSafeUrl(targetUrl, allowedProtocols)) !== null;
}
