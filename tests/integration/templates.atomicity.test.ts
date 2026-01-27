/**
 * Templates API - Atomicity Structural Tests
 *
 * These tests verify the code structure ensures atomicity.
 * For behavioral tests, see templates.behavioral.test.ts
 */

import fs from 'fs/promises';
import path from 'path';

import { describe, it, expect, beforeAll } from 'vitest';

describe('Templates Atomicity - Code Structure Verification', () => {
  let patchHandlerCode: string;
  let fullSourceCode: string;

  beforeAll(async () => {
    const sourcePath = path.join(__dirname, '../../server/routes/templates.routes.ts');
    fullSourceCode = await fs.readFile(sourcePath, 'utf-8');

    // Extract PATCH handler
    const match = fullSourceCode.match(
      /\/\*\*\s*\n\s*\*\s*PATCH \/templates\/:id[\s\S]*?router\.patch\s*\([\s\S]*?\n\s*\}\s*\n\s*\);/
    );
    patchHandlerCode = match ? match[0] : '';
  });

  it('should have exactly ONE download route', () => {
    const downloadRoutePattern = /router\.get\s*\(\s*['"]\/templates\/:id\/download['"]/g;
    const matches = fullSourceCode.match(downloadRoutePattern);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('should save new file BEFORE database update', () => {
    const saveFilePos = patchHandlerCode.indexOf('saveTemplateFile');
    const dbUpdatePos = patchHandlerCode.indexOf('.update(schema.templates)');

    expect(saveFilePos).toBeGreaterThan(-1);
    expect(dbUpdatePos).toBeGreaterThan(-1);
    expect(saveFilePos).toBeLessThan(dbUpdatePos);
  });

  it('should track oldFileRef for cleanup AFTER DB update', () => {
    expect(patchHandlerCode).toMatch(/oldFileRef\s*=\s*template\.fileRef/);

    const newFileRefAssign = patchHandlerCode.indexOf('newFileRef = await saveTemplateFile');
    const oldFileRefAssign = patchHandlerCode.indexOf('oldFileRef = template.fileRef');

    expect(newFileRefAssign).toBeLessThan(oldFileRefAssign);
  });

  it('should delete old file ONLY after DB commit succeeds', () => {
    const returningPos = patchHandlerCode.indexOf('.returning()');
    const deleteOldFilePos = patchHandlerCode.indexOf('deleteTemplateFile(oldFileRef)');

    expect(returningPos).toBeGreaterThan(-1);
    expect(deleteOldFilePos).toBeGreaterThan(-1);
    expect(deleteOldFilePos).toBeGreaterThan(returningPos);
  });

  it('should wrap old file deletion in try-catch for graceful failure', () => {
    expect(patchHandlerCode).toMatch(
      /try\s*\{[\s\S]*?deleteTemplateFile\(oldFileRef\)[\s\S]*?\}\s*catch/
    );
  });

  it('should only attempt deletion when both oldFileRef and newFileRef exist', () => {
    expect(patchHandlerCode).toMatch(/if\s*\(\s*oldFileRef\s*&&\s*newFileRef\s*\)/);
  });

  it('should clean up newFileRef on error (rollback)', () => {
    // The catch block should attempt to delete newFileRef if it exists
    expect(patchHandlerCode).toMatch(/catch[\s\S]*?if\s*\(\s*newFileRef\s*\)[\s\S]*?deleteTemplateFile\(newFileRef\)/);
  });

  it('should have proper auth middleware on all routes', () => {
    // Count route definitions
    const routeDefinitions = fullSourceCode.match(/router\.(get|post|patch|delete)\s*\(/g);
    expect(routeDefinitions).not.toBeNull();

    // Count hybridAuth occurrences
    const authMiddleware = fullSourceCode.match(/hybridAuth,/g);
    expect(authMiddleware).not.toBeNull();

    // Should have auth on every route
    expect(authMiddleware!.length).toBeGreaterThanOrEqual(routeDefinitions!.length);
  });

  it('should invoke virus scanner BEFORE file processing', () => {
    // Check POST handler
    const postHandlerMatch = fullSourceCode.match(
      /router\.post\s*\(\s*['"]\/projects\/:projectId\/templates['"][\s\S]*?(?=router\.|export|$)/
    );
    expect(postHandlerMatch).not.toBeNull();

    const postHandler = postHandlerMatch![0];
    const virusScanPos = postHandler.indexOf('virusScanner()');
    const scanAndFixPos = postHandler.indexOf('templateScanner.scanAndFix');
    const saveFilePos = postHandler.indexOf('saveTemplateFile');

    expect(virusScanPos).toBeGreaterThan(-1);
    expect(virusScanPos).toBeLessThan(scanAndFixPos);
    expect(virusScanPos).toBeLessThan(saveFilePos);
  });
});
