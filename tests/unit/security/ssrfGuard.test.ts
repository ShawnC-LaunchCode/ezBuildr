/**
 * Unit tests for the central SSRF egress guard (C10).
 * Covers IP-literal cases (no DNS) so the suite stays hermetic/network-free.
 */
import { describe, it, expect } from 'vitest';

import { assertOutboundUrlAllowed, isPrivateOrReservedIp } from '../../../server/lib/security/ssrfGuard';

describe('isPrivateOrReservedIp', () => {
  it('flags private / loopback / link-local IPv4', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1']) {
      expect(isPrivateOrReservedIp(ip)).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '203.0.113.10']) {
      expect(isPrivateOrReservedIp(ip)).toBe(false);
    }
  });

  it('flags private / loopback IPv6', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1']) {
      expect(isPrivateOrReservedIp(ip)).toBe(true);
    }
  });

  it('allows public IPv6', () => {
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
  });
});

describe('assertOutboundUrlAllowed', () => {
  it('rejects non-http(s) protocols', async () => {
    await expect(assertOutboundUrlAllowed('file:///etc/passwd')).rejects.toThrow();
    await expect(assertOutboundUrlAllowed('gopher://x/')).rejects.toThrow();
    await expect(assertOutboundUrlAllowed('not a url')).rejects.toThrow();
  });

  it('rejects localhost and loopback', async () => {
    await expect(assertOutboundUrlAllowed('http://localhost/x')).rejects.toThrow();
    await expect(assertOutboundUrlAllowed('http://127.0.0.1/x')).rejects.toThrow();
    await expect(assertOutboundUrlAllowed('http://[::1]/x')).rejects.toThrow();
  });

  it('rejects the cloud metadata endpoint and private ranges', async () => {
    await expect(assertOutboundUrlAllowed('http://169.254.169.254/latest/meta-data/')).rejects.toThrow();
    await expect(assertOutboundUrlAllowed('http://10.1.2.3/')).rejects.toThrow();
    await expect(assertOutboundUrlAllowed('https://192.168.0.1/admin')).rejects.toThrow();
  });

  it('rejects non-dotted IP encodings that decode to loopback', async () => {
    await expect(assertOutboundUrlAllowed('http://2130706433/')).rejects.toThrow(); // 127.0.0.1 decimal
    await expect(assertOutboundUrlAllowed('http://0x7f000001/')).rejects.toThrow(); // 127.0.0.1 hex
  });

  it('allows a public IP literal', async () => {
    await expect(assertOutboundUrlAllowed('https://8.8.8.8/')).resolves.toBeUndefined();
  });
});
