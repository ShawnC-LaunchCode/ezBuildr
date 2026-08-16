import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Proves the generator is actually WIRED to the shared getMigrationHead()
// rather than hardcoding a value or reading the journal a second, divergent
// way (AC4: "a test that would fail if the head were hardcoded or stale").
// Mocked in its own file because vi.mock is hoisted file-wide, and this must
// not affect the unmocked "matches the real current head" test.
vi.mock('../../../server/services/portability/migrationHead', () => ({
  getMigrationHead: vi.fn(() => 'sentinel-migration-head-mig_9999_test'),
}));

import { generateMarketplaceBundles } from '../../../scripts/generateMarketplaceBundles';
import { BundleReader } from '../../../server/services/portability/bundleReader';

const REAL_CURATED_DIR = path.resolve(__dirname, '../../../templates/curated');
const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('generateMarketplaceBundles migrationHead wiring (TM-1 AC4)', () => {
  it('uses whatever the shared getMigrationHead() returns, not a hardcoded value', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezb-marketplace-mig-'));
    tmpDirs.push(outDir);

    const result = await generateMarketplaceBundles({ curatedDir: REAL_CURATED_DIR, outDir });
    expect(result.entries.length).toBeGreaterThan(0);

    for (const entry of result.entries) {
      const reader = new BundleReader(path.join(outDir, entry.bundlePath));
      await reader.open();
      expect(reader.manifest.migrationHead).toBe('sentinel-migration-head-mig_9999_test');
    }
  });
});
