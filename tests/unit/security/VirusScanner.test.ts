/**
 * Virus Scanner Unit Tests
 *
 * Tests the virus scanning interface and ensures it's properly wired into upload flows.
 *
 * The ClamAVVirusScanner tests stand up a fake clamd TCP server (net.createServer,
 * ephemeral port) that speaks the real clamd wire protocol (PING/PONG, INSTREAM),
 * so the client is proven against protocol-accurate responses without requiring a
 * real ClamAV daemon anywhere in CI. See GH-169A.
 */

import net from 'node:net';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { NoOpVirusScanner, ClamAVVirusScanner, getVirusScanner, virusScanner, resetVirusScannerInstance, setVirusScannerInstance, type IVirusScanner } from '../../../server/services/security/VirusScanner';

// The industry-standard "detect me" test string every AV engine (including
// real clamd) recognizes as a signature match. Safe to embed in test source.
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

const INSTREAM_HEADER = 'zINSTREAM\0';

type PingReplyMode = 'PONG' | 'unexpected' | 'timeout';
// The raw clamd reply to send back, or the sentinel 'timeout' to never respond.
type InstreamReplyMode = string;

function bindEphemeral(server: net.Server): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Failed to bind fake clamd server to an ephemeral port'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** Finds a port nothing is listening on, by binding then immediately releasing it. */
async function getUnusedPort(): Promise<number> {
  const { server, port } = await bindEphemeral(net.createServer());
  await closeServer(server);
  return port;
}

/** Fake clamd server that only speaks the PING/PONG health-check exchange. */
async function startFakePingServer(mode: PingReplyMode): Promise<{ server: net.Server; port: number }> {
  const server = net.createServer((socket) => {
    socket.on('data', () => {
      if (mode === 'timeout') {
        return; // deliberately never respond
      }
      socket.write(mode === 'PONG' ? 'PONG\0' : 'UNEXPECTED_REPLY\0');
    });
  });
  return bindEphemeral(server);
}

/**
 * Reassembles clamd's length-prefixed INSTREAM frames from the (header-stripped)
 * accumulated buffer. Returns null when more data is needed, or the reassembled
 * payload once the 4-byte zero-length terminator frame has arrived.
 */
function extractInstreamPayload(buffer: Buffer): { payload: Buffer } | null {
  let offset = 0;
  const frames: Buffer[] = [];
  for (;;) {
    if (buffer.length - offset < 4) {
      return null;
    }
    const frameLength = buffer.readUInt32BE(offset);
    offset += 4;
    if (frameLength === 0) {
      return { payload: Buffer.concat(frames) };
    }
    if (buffer.length - offset < frameLength) {
      return null;
    }
    frames.push(buffer.subarray(offset, offset + frameLength));
    offset += frameLength;
  }
}

/**
 * Fake clamd server that speaks the real INSTREAM wire protocol: strips the
 * "zINSTREAM\0" header, reassembles length-prefixed chunks until the
 * zero-length terminator, then writes back the configured reply (or, for
 * `mode: 'timeout'`, never responds so the client's own timeout fires).
 * Exposes the reassembled payload so tests can prove the client sent the
 * exact bytes it was asked to scan.
 */
async function startFakeInstreamServer(
  mode: InstreamReplyMode
): Promise<{ server: net.Server; port: number; getPayload: () => Buffer | undefined }> {
  let capturedPayload: Buffer | undefined;
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let headerStripped = false;
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!headerStripped) {
        if (buffer.length < INSTREAM_HEADER.length) {
          return;
        }
        buffer = buffer.subarray(INSTREAM_HEADER.length);
        headerStripped = true;
      }
      const result = extractInstreamPayload(buffer);
      if (!result) {
        return;
      }
      capturedPayload = result.payload;
      if (mode !== 'timeout') {
        socket.write(mode);
      }
    });
  });
  const { server: boundServer, port } = await bindEphemeral(server);
  return { server: boundServer, port, getPayload: () => capturedPayload };
}

describe('VirusScanner', () => {
  beforeEach(() => {
    resetVirusScannerInstance();
  });

  afterEach(() => {
    resetVirusScannerInstance();
    vi.unstubAllEnvs();
  });

  describe('NoOpVirusScanner', () => {
    it('should always return safe=true', async () => {
      const scanner = new NoOpVirusScanner();
      const buffer = Buffer.from('test file content');

      const result = await scanner.scan(buffer, 'test.docx');

      expect(result.safe).toBe(true);
      expect(result.scannerName).toBe('NoOpScanner');
      expect(result.fileSize).toBe(buffer.length);
      expect(result.scannedAt).toBeInstanceOf(Date);
      expect(result.scanDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should report healthy', async () => {
      const scanner = new NoOpVirusScanner();
      expect(await scanner.isHealthy()).toBe(true);
    });
  });

  describe('ClamAVVirusScanner', () => {
    let openServers: net.Server[];

    beforeEach(() => {
      openServers = [];
    });

    afterEach(async () => {
      await Promise.all(openServers.map((server) => closeServer(server)));
    });

    /** Points a fresh ClamAVVirusScanner at 127.0.0.1:<port> with a short test timeout. */
    function scannerAgainst(port: number, timeoutMs = 2000): ClamAVVirusScanner {
      vi.stubEnv('CLAMAV_HOST', '127.0.0.1');
      vi.stubEnv('CLAMAV_PORT', String(port));
      vi.stubEnv('CLAMAV_TIMEOUT_MS', String(timeoutMs));
      return new ClamAVVirusScanner();
    }

    // --- AC1: isHealthy() ------------------------------------------------

    it('isHealthy resolves true only on a PONG reply (AC1)', async () => {
      const { server, port } = await startFakePingServer('PONG');
      openServers.push(server);

      const scanner = scannerAgainst(port);

      await expect(scanner.isHealthy()).resolves.toBe(true);
    });

    it('isHealthy resolves false, never throws, on an unexpected reply (AC1)', async () => {
      const { server, port } = await startFakePingServer('unexpected');
      openServers.push(server);

      const scanner = scannerAgainst(port);

      await expect(scanner.isHealthy()).resolves.toBe(false);
    });

    it('isHealthy resolves false, never throws, when the connection is refused (AC1)', async () => {
      const unusedPort = await getUnusedPort();
      const scanner = scannerAgainst(unusedPort, 1000);

      await expect(scanner.isHealthy()).resolves.toBe(false);
    });

    it('isHealthy resolves false, never throws, on a socket timeout (AC1)', async () => {
      const { server, port } = await startFakePingServer('timeout');
      openServers.push(server);

      const scanner = scannerAgainst(port, 150);

      await expect(scanner.isHealthy()).resolves.toBe(false);
    });

    // --- AC2/AC3: scan() over INSTREAM ------------------------------------

    it('scan() implements INSTREAM and returns safe=true for a clean reply (AC2)', async () => {
      const { server, port, getPayload } = await startFakeInstreamServer('stream: OK\0');
      openServers.push(server);
      const scanner = scannerAgainst(port);
      const buffer = Buffer.from('totally harmless file contents');

      const result = await scanner.scan(buffer, 'clean.txt');

      expect(result.safe).toBe(true);
      expect(result.threatName).toBeUndefined();
      expect(result.scannerName).toBe('ClamAV');
      // Proves the client sent the exact bytes over the wire, not just that
      // it parsed a canned reply.
      expect(getPayload()).toEqual(buffer);
    });

    it('scan() returns safe=false with the parsed threat name for a FOUND reply, using the EICAR payload (AC3)', async () => {
      const { server, port, getPayload } = await startFakeInstreamServer(
        'stream: Win.Test.EICAR_HDB-1 FOUND\0'
      );
      openServers.push(server);
      const scanner = scannerAgainst(port);
      const buffer = Buffer.from(EICAR);

      const result = await scanner.scan(buffer, 'eicar.txt');

      expect(result.safe).toBe(false);
      expect(result.threatName).toBe('Win.Test.EICAR_HDB-1');
      expect(getPayload()).toEqual(buffer);
    });

    // --- AC4: fail-closed on every error path, each a separate assertion ---

    it('scan() fails closed with a non-empty threatName when the connection is refused (AC4)', async () => {
      const unusedPort = await getUnusedPort();
      const scanner = scannerAgainst(unusedPort, 1000);

      const result = await scanner.scan(Buffer.from('payload'), 'file.txt');

      expect(result.safe).toBe(false);
      expect(result.threatName).toBeTruthy();
      expect(result.threatName).toBe('SCANNER_UNAVAILABLE');
    });

    it('scan() fails closed with a non-empty threatName on a socket timeout (AC4)', async () => {
      const { server, port } = await startFakeInstreamServer('timeout');
      openServers.push(server);
      const scanner = scannerAgainst(port, 150);

      const result = await scanner.scan(Buffer.from('payload'), 'file.txt');

      expect(result.safe).toBe(false);
      expect(result.threatName).toBeTruthy();
      expect(result.threatName).toBe('SCANNER_UNAVAILABLE');
    });

    it('scan() fails closed with a non-empty threatName on an ERROR reply, not treated as clean (AC4)', async () => {
      const { server, port } = await startFakeInstreamServer('INSTREAM size limit exceeded. ERROR\0');
      openServers.push(server);
      const scanner = scannerAgainst(port);

      const result = await scanner.scan(Buffer.from('payload'), 'file.txt');

      expect(result.safe).toBe(false);
      expect(result.threatName).toBeTruthy();
      expect(result.threatName).toBe('SCANNER_ERROR');
      expect(result.threatName).not.toBe('SCANNER_NOT_IMPLEMENTED');
    });

    // --- AC5: scanDurationMs / fileSize populated on every result ---------

    it('populates scanDurationMs and fileSize correctly on a clean result (AC5)', async () => {
      const { server, port } = await startFakeInstreamServer('stream: OK\0');
      openServers.push(server);
      const scanner = scannerAgainst(port);
      const buffer = Buffer.from('some file content');

      const result = await scanner.scan(buffer, 'file.txt');

      expect(result.fileSize).toBe(buffer.length);
      expect(result.scanDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('populates scanDurationMs and fileSize correctly on a fail-closed result (AC5)', async () => {
      const unusedPort = await getUnusedPort();
      const scanner = scannerAgainst(unusedPort, 1000);
      const buffer = Buffer.from('some file content');

      const result = await scanner.scan(buffer, 'file.txt');

      expect(result.fileSize).toBe(buffer.length);
      expect(result.scanDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getVirusScanner factory', () => {
    it('should return NoOpScanner when ENABLE_VIRUS_SCANNING is not set', () => {
      vi.stubEnv('ENABLE_VIRUS_SCANNING', '');

      const scanner = getVirusScanner();

      expect(scanner).toBeInstanceOf(NoOpVirusScanner);
    });

    it('should return NoOpScanner when ENABLE_VIRUS_SCANNING=false', () => {
      vi.stubEnv('ENABLE_VIRUS_SCANNING', 'false');

      const scanner = getVirusScanner();

      expect(scanner).toBeInstanceOf(NoOpVirusScanner);
    });

    it('should return ClamAVScanner when ENABLE_VIRUS_SCANNING=true and provider=clamav', () => {
      vi.stubEnv('ENABLE_VIRUS_SCANNING', 'true');
      vi.stubEnv('VIRUS_SCANNER_PROVIDER', 'clamav');

      const scanner = getVirusScanner();

      expect(scanner).toBeInstanceOf(ClamAVVirusScanner);
    });

    it('should return NoOpScanner when enabled but provider is noop', () => {
      vi.stubEnv('ENABLE_VIRUS_SCANNING', 'true');
      vi.stubEnv('VIRUS_SCANNER_PROVIDER', 'noop');

      const scanner = getVirusScanner();

      expect(scanner).toBeInstanceOf(NoOpVirusScanner);
    });
  });

  describe('virusScanner singleton', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = virusScanner();
      const instance2 = virusScanner();

      expect(instance1).toBe(instance2);
    });

    it('should allow setting custom instance for testing', async () => {
      const mockScanner: IVirusScanner = {
        scan: vi.fn().mockResolvedValue({
          safe: false,
          threatName: 'TEST_VIRUS',
          scannerName: 'MockScanner',
          scannedAt: new Date(),
          fileSize: 100,
          scanDurationMs: 5,
        }),
        isHealthy: vi.fn().mockResolvedValue(true),
      };

      setVirusScannerInstance(mockScanner);

      const result = await virusScanner().scan(Buffer.from('test'), 'test.exe');

      expect(result.safe).toBe(false);
      expect(result.threatName).toBe('TEST_VIRUS');
      expect(mockScanner.scan).toHaveBeenCalled();
    });
  });

  describe('Scan result contract', () => {
    it('should return all required fields in ScanResult', async () => {
      const scanner = new NoOpVirusScanner();
      const result = await scanner.scan(Buffer.from('test'), 'file.docx');

      // Verify all required fields are present
      expect(result).toHaveProperty('safe');
      expect(result).toHaveProperty('scannerName');
      expect(result).toHaveProperty('scannedAt');
      expect(result).toHaveProperty('fileSize');
      expect(result).toHaveProperty('scanDurationMs');

      // threatName is optional (only present when unsafe)
      expect(typeof result.safe).toBe('boolean');
      expect(typeof result.scannerName).toBe('string');
      expect(typeof result.fileSize).toBe('number');
      expect(typeof result.scanDurationMs).toBe('number');
    });
  });
});
