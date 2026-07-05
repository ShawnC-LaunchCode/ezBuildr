/**
 * Central SSRF egress guard.
 *
 * Any server-side fetch to a user-/config-controlled URL must pass through
 * `assertOutboundUrlAllowed()` first. This blocks requests to loopback, private
 * (RFC 1918 / ULA), link-local (incl. the 169.254.169.254 cloud-metadata endpoint),
 * CGNAT, multicast and other reserved ranges — checked both against IP literals
 * (including decimal/hex/octal encodings) and against every address a hostname
 * resolves to via DNS.
 *
 * Note: this narrows but does not fully eliminate DNS-rebinding TOCTOU, since the
 * socket is not pinned to the validated IP. For the highest-risk paths, prefer an
 * egress proxy/allowlist. This guard is the baseline applied everywhere.
 */
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

/** Check whether an IPv4 address (first three octets suffice) is private/reserved. */
function isPrivateIpv4(a: number, b: number, c: number): boolean {
  if (a === 0) { return true; }                       // 0.0.0.0/8 "this host"
  if (a === 10) { return true; }                      // 10.0.0.0/8
  if (a === 127) { return true; }                     // loopback
  if (a === 169 && b === 254) { return true; }        // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) { return true; } // 172.16.0.0/12
  if (a === 192 && b === 168) { return true; }        // 192.168.0.0/16
  if (a === 192 && b === 0 && c === 0) { return true; } // 192.0.0.0/24
  if (a === 100 && b >= 64 && b <= 127) { return true; } // 100.64.0.0/10 CGNAT
  // 224.0.0.0/4 multicast + 240/4 reserved + 255.255.255.255 broadcast
  return a >= 224;
}

function ipv4FromInt(n: number): [number, number, number, number] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** Returns true if the given IP literal string is private/reserved. */
export function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return isPrivateIpv4(a, b, c);
  }
  if (family === 6) {
    const addr = ip.toLowerCase();
    if (addr === '::1' || addr === '::') { return true; } // loopback / unspecified
    // IPv4-mapped (::ffff:a.b.c.d) — evaluate the embedded IPv4.
    if (addr.includes('.')) {
      const tail = addr.slice(addr.lastIndexOf(':') + 1);
      if (net.isIP(tail) === 4) { return isPrivateOrReservedIp(tail); }
    }
    const firstHextet = parseInt(addr.split(':')[0] || '0', 16) || 0;
    if ((firstHextet & 0xfe00) === 0xfc00) { return true; } // fc00::/7 ULA
    if ((firstHextet & 0xffc0) === 0xfe80) { return true; } // fe80::/10 link-local
    // ff00::/8 multicast
    return (firstHextet & 0xff00) === 0xff00;
  }
  return false; // not an IP literal
}

/**
 * Normalize a URL hostname that is an IP literal in a non-dotted encoding
 * (decimal integer, hex, or octal) into a dotted IPv4 string. Returns null if the
 * hostname is not such an encoding (i.e. it should be treated as a DNS name).
 */
function normalizeNumericHost(host: string): string | null {
  let n: number | null = null;
  if (/^0x[0-9a-f]+$/i.test(host)) {
    n = parseInt(host, 16);
  } else if (/^0[0-7]+$/.test(host)) {
    n = parseInt(host, 8);
  } else if (/^\d+$/.test(host)) {
    n = parseInt(host, 10);
  }
  if (n === null || !Number.isFinite(n) || n < 0 || n > 0xffffffff) { return null; }
  const [a, b, c, d] = ipv4FromInt(n);
  return `${a}.${b}.${c}.${d}`;
}

/**
 * Assert that a URL is safe to fetch server-side. Throws SsrfError if the URL uses a
 * disallowed protocol or resolves to a private/reserved/loopback/link-local address.
 */
export async function assertOutboundUrlAllowed(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfError(`Blocked URL protocol: ${parsed.protocol}`);
  }

  // Strip IPv6 brackets, lowercase.
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  if (!host) {
    throw new SsrfError('URL has no host');
  }

  // Obvious loopback names.
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new SsrfError('Requests to localhost are not allowed');
  }

  // IP literal (standard dotted / IPv6).
  if (net.isIP(host) !== 0) {
    if (isPrivateOrReservedIp(host)) {
      throw new SsrfError('Requests to private/reserved IP addresses are not allowed');
    }
    return;
  }

  // IP literal in a non-dotted encoding (decimal/hex/octal).
  const numeric = normalizeNumericHost(host);
  if (numeric) {
    if (isPrivateOrReservedIp(numeric)) {
      throw new SsrfError('Requests to private/reserved IP addresses are not allowed');
    }
    return;
  }

  // DNS name — resolve and reject if ANY resolved address is private/reserved.
  // In the test environment the network is mocked and real DNS is unavailable/unreliable, so
  // skip the resolution step there. All synchronous checks above (protocol, localhost, literal
  // private/reserved IPs incl. numeric encodings) still run in tests; full DNS resolution runs
  // in development and production.
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new SsrfError(`Could not resolve host: ${host}`);
  }
  if (addresses.length === 0) {
    throw new SsrfError(`Host did not resolve: ${host}`);
  }
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new SsrfError('Host resolves to a private/reserved IP address');
    }
  }
}
