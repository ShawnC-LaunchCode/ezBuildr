/**
 * Virus Scanner Unit Tests
 *
 * Tests the virus scanning interface and ensures it's properly wired into upload flows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  NoOpVirusScanner,
  ClamAVVirusScanner,
  getVirusScanner,
  virusScanner,
  resetVirusScannerInstance,
  setVirusScannerInstance,
  type IVirusScanner,
  type ScanResult,
} from '../../../server/services/security/VirusScanner';

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
    it('should reject files when not implemented (fail-safe)', async () => {
      const scanner = new ClamAVVirusScanner();
      const buffer = Buffer.from('test content');

      const result = await scanner.scan(buffer, 'test.pdf');

      // ClamAV scanner should REJECT files when not properly implemented
      // This is a fail-safe behavior
      expect(result.safe).toBe(false);
      expect(result.threatName).toBe('SCANNER_NOT_IMPLEMENTED');
      expect(result.scannerName).toBe('ClamAV');
    });

    it('should report unhealthy when not implemented', async () => {
      const scanner = new ClamAVVirusScanner();
      expect(await scanner.isHealthy()).toBe(false);
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
