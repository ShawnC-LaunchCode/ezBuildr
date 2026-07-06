import dns from 'dns/promises';

import { Agent } from 'undici';

import { isInternalIp } from './ssrfValidator';

/**
 * A safe fetch wrapper that prevents DNS rebinding TOCTOU attacks.
 * It manually resolves the DNS, ensures the IP is not internal/loopback,
 * and pins the Undici Agent to that exact IP address.
 */
export async function safeFetch(url: string, init: RequestInit = {}) {
    const parsed = new URL(url);
    
    // Only apply DNS pinning for http and https
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        const addrs = await dns.resolve(parsed.hostname);
        
        // Loopback / simple string checks
        if (["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname)) {
            // SEC-014: Gate loopback usage behind explicit env var
            if (process.env.ALLOW_LOCALHOST_WEBHOOKS !== "true") {
                throw new Error(`SSRF Prevention: loopback is disabled`);
            } else {
                // If allowed, just do normal fetch for loopback
                return fetch(url, init);
            }
        }

        if (addrs.some(isInternalIp)) {
            throw new Error(`SSRF Prevention: URL resolved to an internal/reserved address (${parsed.hostname})`);
        }
        
        const pinnedIp = addrs[0];
        
        const agent = new Agent({
            connect: { 
                // Pin the socket connection to the exact IP we validated
                lookup: (_hostname, _options, cb) => cb(null, [{ address: pinnedIp, family: pinnedIp.includes(':') ? 6 : 4 }])
            }
        });
        
        // Pass the custom dispatcher
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        const finalInit: any = { ...init, dispatcher: agent };
        return fetch(url, finalInit);
    }
    
    return fetch(url, init);
}
