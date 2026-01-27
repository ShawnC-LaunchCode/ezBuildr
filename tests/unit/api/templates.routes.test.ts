/**
 * Templates Routes - Regression Tests
 *
 * Ensures no duplicate route definitions and proper route structure.
 * These tests prevent regression to the duplicate route bug.
 */

import fs from 'fs/promises';
import path from 'path';

import { describe, it, expect, beforeAll } from 'vitest';

describe('Templates Routes - No Duplicate Routes', () => {
  let sourceCode: string;

  beforeAll(async () => {
    const sourcePath = path.join(__dirname, '../../../server/routes/templates.routes.ts');
    sourceCode = await fs.readFile(sourcePath, 'utf-8');
  });

  it('should have exactly ONE GET /templates/:id/download route', () => {
    // Count occurrences of the download route registration
    const downloadRoutePattern = /router\.get\s*\(\s*['"]\/templates\/:id\/download['"]/g;
    const matches = sourceCode.match(downloadRoutePattern);

    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('should have exactly ONE GET /templates/:id route', () => {
    // The :id route should not be duplicated
    // Note: /templates/:id/download is different from /templates/:id
    const templateIdRoutePattern = /router\.get\s*\(\s*['"]\/templates\/:id['"]\s*,/g;
    const matches = sourceCode.match(templateIdRoutePattern);

    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('should have exactly ONE PATCH /templates/:id route', () => {
    const patchRoutePattern = /router\.patch\s*\(\s*['"]\/templates\/:id['"]/g;
    const matches = sourceCode.match(patchRoutePattern);

    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('should have exactly ONE DELETE /templates/:id route', () => {
    const deleteRoutePattern = /router\.delete\s*\(\s*['"]\/templates\/:id['"]/g;
    const matches = sourceCode.match(deleteRoutePattern);

    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('should have exactly ONE POST /projects/:projectId/templates route', () => {
    const postRoutePattern = /router\.post\s*\(\s*['"]\/projects\/:projectId\/templates['"]/g;
    const matches = sourceCode.match(postRoutePattern);

    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('should have exactly ONE GET /projects/:projectId/templates route', () => {
    const getRoutePattern = /router\.get\s*\(\s*['"]\/projects\/:projectId\/templates['"]/g;
    const matches = sourceCode.match(getRoutePattern);

    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });
});

describe('Templates Routes - Virus Scanning', () => {
  let sourceCode: string;

  beforeAll(async () => {
    const sourcePath = path.join(__dirname, '../../../server/routes/templates.routes.ts');
    sourceCode = await fs.readFile(sourcePath, 'utf-8');
  });

  it('should import virusScanner', () => {
    expect(sourceCode).toMatch(/import.*virusScanner.*from.*VirusScanner/);
  });

  it('should call virusScanner in POST handler', () => {
    // Find the POST /projects/:projectId/templates handler
    const postHandlerMatch = sourceCode.match(
      /router\.post\s*\(\s*['"]\/projects\/:projectId\/templates['"][\s\S]*?(?=router\.|export|$)/
    );

    expect(postHandlerMatch).not.toBeNull();
    expect(postHandlerMatch![0]).toContain('virusScanner()');
  });

  it('should call virusScanner in PATCH handler', () => {
    // Find the PATCH /templates/:id handler
    const patchHandlerMatch = sourceCode.match(
      /router\.patch\s*\(\s*['"]\/templates\/:id['"][\s\S]*?(?=router\.|export|$)/
    );

    expect(patchHandlerMatch).not.toBeNull();
    expect(patchHandlerMatch![0]).toContain('virusScanner()');
  });

  it('should reject files when virus scan fails', () => {
    // Check that the code throws/rejects on scanResult.safe === false
    expect(sourceCode).toMatch(/if\s*\(\s*!.*scanResult\.safe|!virusScanResult\.safe/);
    expect(sourceCode).toMatch(/malware detected/i);
  });
});

describe('Templates Routes - Atomic File Replacement', () => {
  let sourceCode: string;

  beforeAll(async () => {
    const sourcePath = path.join(__dirname, '../../../server/routes/templates.routes.ts');
    sourceCode = await fs.readFile(sourcePath, 'utf-8');
  });

  it('should track old file reference for cleanup after DB update', () => {
    // The PATCH handler should have oldFileRef tracking
    expect(sourceCode).toMatch(/oldFileRef.*=.*template\.fileRef/);
  });

  it('should delete old file AFTER database update, not before', () => {
    // Find the PATCH handler and verify order
    const patchHandlerMatch = sourceCode.match(
      /router\.patch\s*\(\s*['"]\/templates\/:id['"][\s\S]*?(?=router\.|\/\*\*|export|$)/
    );

    expect(patchHandlerMatch).not.toBeNull();
    const handler = patchHandlerMatch![0];

    // DB update should come BEFORE deleteTemplateFile
    // Note: Code may have newlines between 'db' and '.update', so we search for '.update(schema.templates)'
    const dbUpdatePos = handler.indexOf('.update(schema.templates)');
    const deleteFilePos = handler.indexOf('deleteTemplateFile(oldFileRef)');

    expect(dbUpdatePos).toBeGreaterThan(-1);
    expect(deleteFilePos).toBeGreaterThan(-1);
    expect(dbUpdatePos).toBeLessThan(deleteFilePos);
  });

  it('should have comment explaining atomicity fix', () => {
    expect(sourceCode).toMatch(/CRITICAL.*delete.*AFTER.*DB|atomicity/i);
  });

  it('should handle cleanup failure gracefully (log, dont fail)', () => {
    // Cleanup should be in try-catch with logging
    expect(sourceCode).toMatch(/try\s*{[\s\S]*?deleteTemplateFile\(oldFileRef\)[\s\S]*?catch.*cleanupError/);
    expect(sourceCode).toMatch(/logger\.warn.*oldFileRef|Failed to delete old template/);
  });
});
