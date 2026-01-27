/**
 * PdfService Security Tests
 *
 * Ensures PdfService uses safe command execution patterns (execFile, not exec with shell).
 * These tests prevent regression to shell command injection vulnerabilities.
 */

import fs from 'fs/promises';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Read the source file to verify it uses execFile
describe('PdfService Security - Command Execution', () => {
  let sourceCode: string;

  beforeEach(async () => {
    const sourcePath = path.join(__dirname, '../../../server/services/document/PdfService.ts');
    sourceCode = await fs.readFile(sourcePath, 'utf-8');
  });

  it('should import execFile, not exec', () => {
    // Must use execFile (no shell spawned)
    expect(sourceCode).toMatch(/import\s*{\s*execFile\s*}/);

    // Must NOT use exec (shell is spawned, vulnerable to injection)
    expect(sourceCode).not.toMatch(/import\s*{\s*exec\s*}\s*from\s*['"]child_process['"]/);
  });

  it('should use execFileAsync with argument array, not string interpolation', () => {
    // Should have execFileAsync defined
    expect(sourceCode).toContain('execFileAsync');

    // The call should use array syntax: execFileAsync('qpdf', ['--decrypt', ...])
    // NOT: execAsync(`qpdf --decrypt "${inputPath}" "${outputPath}"`)
    expect(sourceCode).toMatch(/execFileAsync\s*\(\s*['"]qpdf['"]\s*,\s*\[/);

    // Should NOT have string template execution
    expect(sourceCode).not.toMatch(/execAsync\s*\(\s*`qpdf/);
    expect(sourceCode).not.toMatch(/exec\s*\(\s*`qpdf/);
  });

  it('should not use shell: true option', () => {
    // execFile with shell: true defeats the purpose
    expect(sourceCode).not.toMatch(/shell\s*:\s*true/);
  });

  it('should have security comment explaining the pattern', () => {
    // Code should document why execFile is used
    expect(sourceCode).toMatch(/SECURITY.*execFile|execFile.*injection|shell.*injection/i);
  });
});

describe('PdfService - Functional Security', () => {
  // Mock child_process to verify execFile is called with correct args
  it('should call qpdf with separate arguments (no shell)', async () => {
    const mockExecFile = vi.fn().mockImplementation(
      (_cmd: string, _args: string[], callback?: Function) => {
        // Simulate successful execution
        if (callback) {callback(null, '', '');}
        return { stdout: '', stderr: '' };
      }
    );

    // This test verifies the pattern by checking the source code structure
    // A more complete test would mock the module, but that's complex with ESM
    const sourcePath = path.join(__dirname, '../../../server/services/document/PdfService.ts');
    const source = await fs.readFile(sourcePath, 'utf-8');

    // Verify the unlockPdf method uses the safe pattern
    const unlockPdfMethod = source.match(/async unlockPdf[\s\S]*?finally\s*{[\s\S]*?}/);
    expect(unlockPdfMethod).not.toBeNull();

    if (unlockPdfMethod) {
      const methodCode = unlockPdfMethod[0];

      // Must use execFileAsync with array args
      expect(methodCode).toMatch(/execFileAsync\s*\(\s*['"]qpdf['"]\s*,\s*\[\s*['"]--decrypt['"]/);

      // Must NOT use string interpolation for command
      expect(methodCode).not.toContain('`qpdf');
    }
  });

  it('should properly escape or avoid special characters in paths', async () => {
    // The safe pattern (execFile with array) handles special chars automatically
    // This test documents that requirement
    const sourcePath = path.join(__dirname, '../../../server/services/document/PdfService.ts');
    const source = await fs.readFile(sourcePath, 'utf-8');

    // Paths should be passed as separate arguments, not interpolated into a string
    // Pattern: execFileAsync('qpdf', ['--decrypt', inputPath, outputPath])
    // NOT: execAsync(`qpdf --decrypt "${inputPath}" "${outputPath}"`)

    // The array pattern automatically handles:
    // - Spaces in filenames
    // - Special characters ($, `, !, etc.)
    // - Newlines
    // - Quote characters

    expect(source).toMatch(/execFileAsync\s*\(\s*['"]qpdf['"]\s*,\s*\[[\s\S]*inputPath[\s\S]*outputPath/);
  });
});
