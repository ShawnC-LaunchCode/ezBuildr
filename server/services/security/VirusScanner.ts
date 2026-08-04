/**
 * Virus Scanner Interface and Implementations
 *
 * Production: Integrate ClamAV, VirusTotal, or cloud-based scanning
 * Development: Uses NoOpScanner (always passes)
 *
 * Feature flag: ENABLE_VIRUS_SCANNING=true
 * ClamAV config: CLAMAV_HOST, CLAMAV_PORT (defaults: localhost:3310)
 */

import net from 'node:net';

import { logger } from '../../logger';

export interface ScanResult {
  safe: boolean;
  threatName?: string;
  scannerName: string;
  scannedAt: Date;
  fileSize: number;
  scanDurationMs: number;
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- I-prefix interface naming convention
export interface IVirusScanner {
  /**
   * Scan a file buffer for malware
   * @returns ScanResult with safe=true if clean, safe=false with threatName if infected
   * @throws Error if scanner is unavailable
   */
  scan(buffer: Buffer, filename: string): Promise<ScanResult>;

  /**
   * Check if scanner is available and healthy
   */
  isHealthy(): Promise<boolean>;
}

/**
 * No-Op Scanner for development/testing
 * Always returns safe=true
 */
export class NoOpVirusScanner implements IVirusScanner {
  scan(buffer: Buffer, filename: string): Promise<ScanResult> {
    const startTime = Date.now();

    logger.warn(
      { filename, size: buffer.length },
      'NoOpVirusScanner: File accepted WITHOUT virus scanning (dev mode)'
    );

    return Promise.resolve({
      safe: true,
      scannerName: 'NoOpScanner',
      scannedAt: new Date(),
      fileSize: buffer.length,
      scanDurationMs: Date.now() - startTime,
    });
  }

  isHealthy(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

// clamd's INSTREAM protocol streams the payload in chunks capped well under
// its own default StreamMaxLength; 64 KB keeps memory bounded per chunk.
const INSTREAM_CHUNK_SIZE = 64 * 1024;
const DEFAULT_CLAMAV_TIMEOUT_MS = 30000;

interface ClamdConnectionOptions {
  host: string;
  port: number;
  timeoutMs: number;
}

interface ClamdScanOutcome {
  infected: boolean;
  threatName?: string;
  /** Set when clamd's reply itself signals a scanner-side failure (never "clean"). */
  errorMessage?: string;
}

function getClamavTimeoutMs(): number {
  return parseInt(process.env.CLAMAV_TIMEOUT_MS ?? String(DEFAULT_CLAMAV_TIMEOUT_MS), 10);
}

/**
 * Opens a TCP socket to clamd and wires up a shared timeout/error/cleanup
 * contract. `onConnect` drives the protocol-specific exchange (PING or
 * INSTREAM) and settles the returned promise via the resolve/reject it is
 * handed; the socket is always torn down afterward.
 */
function withClamdSocket<T>(
  { host, port, timeoutMs }: ClamdConnectionOptions,
  onConnect: (socket: net.Socket, resolve: (value: T) => void, reject: (reason: Error) => void) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const settleReject = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      reject(error);
    };
    const settleResolve = (value: T): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.end();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => settleReject(new Error(`clamd connection to ${host}:${port} timed out`)));
    socket.once('error', (error) => settleReject(error instanceof Error ? error : new Error(String(error))));

    socket.connect(port, host, () => {
      onConnect(socket, settleResolve, settleReject);
    });
  });
}

async function pingClamd(options: ClamdConnectionOptions): Promise<boolean> {
  return withClamdSocket<boolean>(options, (socket, resolve) => {
    let reply = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      reply = Buffer.concat([reply, chunk]);
      // PONG\0 is short and clamd sends it in one write; resolve as soon as
      // we can classify the reply rather than waiting on the socket to close.
      if (reply.includes('PONG')) {
        resolve(true);
      } else if (reply.length > 0) {
        resolve(false);
      }
    });
    socket.write('zPING\0');
  });
}

/** Writes the INSTREAM payload as length-prefixed chunks, then the zero-length terminator. */
function writeInstreamPayload(socket: net.Socket, buffer: Buffer, reject: (error: Error) => void): void {
  try {
    for (let offset = 0; offset < buffer.length; offset += INSTREAM_CHUNK_SIZE) {
      const chunk = buffer.subarray(offset, Math.min(offset + INSTREAM_CHUNK_SIZE, buffer.length));
      const lengthPrefix = Buffer.alloc(4);
      lengthPrefix.writeUInt32BE(chunk.length, 0);
      socket.write(lengthPrefix);
      socket.write(chunk);
    }
    socket.write(Buffer.alloc(4)); // 4 zero bytes = end-of-stream marker
  } catch (error) {
    reject(error instanceof Error ? error : new Error(String(error)));
  }
}

function parseInstreamReply(rawReply: string): ClamdScanOutcome {
  const reply = rawReply.replace(/\0/g, '').trim();

  // Checked before FOUND/OK: an ERROR reply (e.g. "INSTREAM size limit
  // exceeded. ERROR") must never be classified as clean or as a detection.
  if (reply.includes('ERROR')) {
    return { infected: false, errorMessage: reply };
  }

  const foundMatch = /stream:\s*(.+?)\s+FOUND/.exec(reply);
  if (foundMatch) {
    return { infected: true, threatName: foundMatch[1] };
  }

  if (reply.includes('stream: OK')) {
    return { infected: false };
  }

  return { infected: false, errorMessage: `Unexpected clamd reply: ${reply}` };
}

async function scanWithClamd(options: ClamdConnectionOptions, buffer: Buffer): Promise<ClamdScanOutcome> {
  return withClamdSocket<ClamdScanOutcome>(options, (socket, resolve, reject) => {
    let replyBuffer = Buffer.alloc(0);

    socket.on('data', (chunk: Buffer) => {
      replyBuffer = Buffer.concat([replyBuffer, chunk]);
      const reply = replyBuffer.toString('utf8');
      // clamd's final reply is NUL- or newline-terminated; wait for a full one.
      if (!reply.includes('\0') && !reply.includes('\n')) {
        return;
      }
      resolve(parseInstreamReply(reply));
    });

    socket.write('zINSTREAM\0', (writeError) => {
      if (writeError) {
        reject(writeError);
        return;
      }
      writeInstreamPayload(socket, buffer, reject);
    });
  });
}

/**
 * ClamAV Scanner for production.
 *
 * Speaks clamd's INSTREAM protocol directly over `node:net` (no `clamscan`
 * dependency — see GH-169A). Fails closed on every infrastructure error:
 * connection refused, timeout, or a malformed/ERROR reply all resolve
 * `safe: false`, never `safe: true`.
 */
export class ClamAVVirusScanner implements IVirusScanner {
  private host: string;
  private port: number;

  constructor() {
    this.host = process.env.CLAMAV_HOST ?? 'localhost';
    this.port = parseInt(process.env.CLAMAV_PORT ?? '3310', 10);
  }

  async scan(buffer: Buffer, filename: string): Promise<ScanResult> {
    const startTime = Date.now();
    const connectionOptions: ClamdConnectionOptions = { host: this.host, port: this.port, timeoutMs: getClamavTimeoutMs() };

    try {
      const outcome = await scanWithClamd(connectionOptions, buffer);

      if (outcome.errorMessage) {
        logger.error(
          { filename, host: this.host, port: this.port, error: outcome.errorMessage },
          'ClamAV scan returned an error reply - failing closed'
        );
        return {
          safe: false,
          threatName: 'SCANNER_ERROR',
          scannerName: 'ClamAV',
          scannedAt: new Date(),
          fileSize: buffer.length,
          scanDurationMs: Date.now() - startTime,
        };
      }

      if (outcome.infected) {
        logger.warn({ filename, threatName: outcome.threatName }, 'ClamAV detected a threat');
      }

      return {
        safe: !outcome.infected,
        threatName: outcome.infected ? outcome.threatName : undefined,
        scannerName: 'ClamAV',
        scannedAt: new Date(),
        fileSize: buffer.length,
        scanDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(
        { error, filename, host: this.host, port: this.port },
        'ClamAV scanner unavailable - failing closed'
      );
      return {
        safe: false,
        threatName: 'SCANNER_UNAVAILABLE',
        scannerName: 'ClamAV',
        scannedAt: new Date(),
        fileSize: buffer.length,
        scanDurationMs: Date.now() - startTime,
      };
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      return await pingClamd({ host: this.host, port: this.port, timeoutMs: getClamavTimeoutMs() });
    } catch (error) {
      logger.error({ error, host: this.host, port: this.port }, 'ClamAV health check failed');
      return false;
    }
  }
}

/**
 * Factory function to get the appropriate scanner based on configuration
 */
export function getVirusScanner(): IVirusScanner {
  const enabled = process.env.ENABLE_VIRUS_SCANNING === 'true';
  const provider = process.env.VIRUS_SCANNER_PROVIDER ?? 'noop';

  if (!enabled) {
    return new NoOpVirusScanner();
  }

  switch (provider.toLowerCase()) {
    case 'clamav':
      return new ClamAVVirusScanner();
    case 'noop':
    default:
      logger.warn('ENABLE_VIRUS_SCANNING=true but provider is noop - using NoOpScanner');
      return new NoOpVirusScanner();
  }
}

// Singleton instance
let scannerInstance: IVirusScanner | null = null;

export function virusScanner(): IVirusScanner {
  if (!scannerInstance) {
    scannerInstance = getVirusScanner();
  }
  return scannerInstance;
}

// For testing: allow resetting the singleton
export function resetVirusScannerInstance(): void {
  scannerInstance = null;
}

export function setVirusScannerInstance(scanner: IVirusScanner): void {
  scannerInstance = scanner;
}
