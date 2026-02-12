/**
 * Virus Scanner Interface and Implementations
 *
 * Production: Integrate ClamAV, VirusTotal, or cloud-based scanning
 * Development: Uses NoOpScanner (always passes)
 *
 * Feature flag: ENABLE_VIRUS_SCANNING=true
 * ClamAV config: CLAMAV_HOST, CLAMAV_PORT (defaults: localhost:3310)
 */

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

/**
 * ClamAV Scanner for production
 * Requires ClamAV daemon running (clamd)
 *
 * TODO: Production implementation
 * 1. Install clamav: npm install clamscan
 * 2. Configure CLAMAV_HOST and CLAMAV_PORT
 * 3. Ensure clamd is running on the host
 */
export class ClamAVVirusScanner implements IVirusScanner {
  private host: string;
  private port: number;

  constructor() {
    this.host = process.env.CLAMAV_HOST ?? 'localhost';
    this.port = parseInt(process.env.CLAMAV_PORT ?? '3310', 10);
  }

  scan(buffer: Buffer, filename: string): Promise<ScanResult> {
    const startTime = Date.now();

    // TODO: Implement actual ClamAV integration
    // Example using clamscan npm package:
    //
    // const clamscan = await new NodeClam().init({
    //   clamdscan: {
    //     host: this.host,
    //     port: this.port,
    //     timeout: 60000,
    //   }
    // });
    // const { isInfected, viruses } = await clamscan.scanBuffer(buffer);

    logger.error(
      { filename, host: this.host, port: this.port },
      'ClamAV scanner not implemented - rejecting file for safety'
    );

    // Fail-safe: Reject files when ClamAV is configured but not implemented
    return Promise.resolve({
      safe: false,
      threatName: 'SCANNER_NOT_IMPLEMENTED',
      scannerName: 'ClamAV',
      scannedAt: new Date(),
      fileSize: buffer.length,
      scanDurationMs: Date.now() - startTime,
    });
  }

  isHealthy(): Promise<boolean> {
    // TODO: Implement health check via PING command to clamd
    return Promise.resolve(false);
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
