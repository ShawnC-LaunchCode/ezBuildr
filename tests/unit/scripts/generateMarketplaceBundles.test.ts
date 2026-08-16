import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';

import { generateMarketplaceBundles } from '../../../scripts/generateMarketplaceBundles';
import { parseCuratedWorkflow } from '../../../scripts/curatedWorkflowSchema';
import { BundleReader } from '../../../server/services/portability/bundleReader';
import { manifestSchema } from '../../../server/services/portability/bundleFormat';
import { getMigrationHead } from '../../../server/services/portability/migrationHead';

const REAL_CURATED_DIR = path.resolve(__dirname, '../../../templates/curated');
const REAL_CURATED_SLUGS = fs
  .readdirSync(REAL_CURATED_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('generateMarketplaceBundles (TM-1)', () => {
  // AC1: npm run build produces one bundle per curated template plus an index, under dist/.
  it('produces one bundle per curated template plus a machine-readable index', async () => {
    const outDir = makeTmpDir('ezb-marketplace-out-');

    const result = await generateMarketplaceBundles({ curatedDir: REAL_CURATED_DIR, outDir });

    expect(result.entries).toHaveLength(REAL_CURATED_SLUGS.length);
    expect(result.entries.map((e) => e.slug).sort()).toEqual(REAL_CURATED_SLUGS);

    for (const entry of result.entries) {
      expect(fs.existsSync(path.join(outDir, entry.bundlePath))).toBe(true);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.category.length).toBeGreaterThan(0);
      expect(entry.tags.length).toBeGreaterThan(0);
    }

    expect(fs.existsSync(result.indexPath)).toBe(true);
    const indexOnDisk = JSON.parse(fs.readFileSync(result.indexPath, 'utf8'));
    expect(indexOnDisk).toEqual(result.entries);
  });

  // AC2: each generated bundle is readable by BundleReader and validates
  // against bundleFormat's manifest schema - asserted by a test.
  it('writes bundles that BundleReader can open and that validate against manifestSchema', async () => {
    const outDir = makeTmpDir('ezb-marketplace-out-');
    const result = await generateMarketplaceBundles({ curatedDir: REAL_CURATED_DIR, outDir });

    for (const entry of result.entries) {
      const reader = new BundleReader(path.join(outDir, entry.bundlePath));
      await expect(reader.open()).resolves.toBeUndefined();

      const parsed = manifestSchema.safeParse(reader.manifest);
      expect(parsed.success).toBe(true);
      expect(reader.manifest.scope).toBe('workflow');
      expect(reader.manifest.blobCount).toBe(1);
      expect(reader.manifest.entityCounts.workflows).toBe(1);
      expect(reader.manifest.entityCounts.templates).toBe(1);

      // The bundle must actually be importable content, not just a valid
      // envelope: at least one workflows/sections/steps row each.
      const workflowRows: unknown[] = [];
      for await (const row of reader.readEntityStream('workflows')) {
        workflowRows.push(row);
      }
      expect(workflowRows).toHaveLength(1);

      const stepRows: unknown[] = [];
      for await (const row of reader.readEntityStream('steps')) {
        stepRows.push(row);
      }
      expect(stepRows.length).toBeGreaterThan(0);
    }
  });

  // AC3: template.docx is present in each bundle as a blob, and its bytes
  // round-trip byte-identical.
  it('round-trips template.docx byte-identical as a blob', async () => {
    const outDir = makeTmpDir('ezb-marketplace-out-');
    const result = await generateMarketplaceBundles({ curatedDir: REAL_CURATED_DIR, outDir });

    for (const entry of result.entries) {
      const originalBytes = fs.readFileSync(path.join(REAL_CURATED_DIR, entry.slug, 'template.docx'));
      const originalSha256 = createHash('sha256').update(originalBytes).digest('hex');

      const reader = new BundleReader(path.join(outDir, entry.bundlePath));
      await reader.open();

      const blobIndex = await reader.readBlobIndex();
      const indexEntries = Object.values(blobIndex);
      expect(indexEntries).toHaveLength(1);
      expect(indexEntries[0].sha256).toBe(originalSha256);
      expect(indexEntries[0].size).toBe(originalBytes.length);

      const blobBytes = await reader.readBlob(indexEntries[0].sha256);
      expect(Buffer.compare(blobBytes, originalBytes)).toBe(0);
    }
  });

  // AC4: migrationHead in each generated manifest equals the current journal
  // head (the mocked-module variant lives in
  // generateMarketplaceBundles.migrationHead.test.ts; this proves the two
  // callers - ExportService and this generator - agree on the live value).
  it('stamps the current migration journal head into every manifest', async () => {
    const outDir = makeTmpDir('ezb-marketplace-out-');
    const result = await generateMarketplaceBundles({ curatedDir: REAL_CURATED_DIR, outDir });
    const currentHead = getMigrationHead();

    for (const entry of result.entries) {
      const reader = new BundleReader(path.join(outDir, entry.bundlePath));
      await reader.open();
      expect(reader.manifest.migrationHead).toBe(currentHead);
    }
  });

  // AC5: a malformed workflow.json fails the build with a message naming the
  // file and the field.
  describe('malformed workflow.json (AC5)', () => {
    function writeFixture(json: unknown): { curatedDir: string; jsonPath: string } {
      const curatedDir = makeTmpDir('ezb-marketplace-curated-');
      const slugDir = path.join(curatedDir, 'broken-template');
      fs.mkdirSync(slugDir, { recursive: true });
      const jsonPath = path.join(slugDir, 'workflow.json');
      fs.writeFileSync(jsonPath, JSON.stringify(json));
      // template.docx deliberately absent: workflow.json validation must fail
      // before the generator ever looks for it.
      return { curatedDir, jsonPath };
    }

    it('rejects a missing required field, naming the file and the field', async () => {
      const { curatedDir, jsonPath } = writeFixture({
        // title missing entirely
        sections: [{ title: 'A section', steps: [{ alias: 'a', type: 'short_text', title: 'A' }] }],
      });

      await expect(
        generateMarketplaceBundles({ curatedDir, outDir: makeTmpDir('ezb-marketplace-out-') })
      ).rejects.toThrow(/title/);
      await expect(
        generateMarketplaceBundles({ curatedDir, outDir: makeTmpDir('ezb-marketplace-out-') })
      ).rejects.toThrow(new RegExp(jsonPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    it('rejects an unknown top-level field, naming the file and the field', async () => {
      const { curatedDir, jsonPath } = writeFixture({
        title: 'Broken',
        sections: [{ title: 'A section', steps: [{ alias: 'a', type: 'short_text', title: 'A' }] }],
        notAField: true,
      });

      await expect(
        generateMarketplaceBundles({ curatedDir, outDir: makeTmpDir('ezb-marketplace-out-') })
      ).rejects.toThrow(/notAField/);
      expect(jsonPath).toContain('broken-template');
    });

    it('rejects a bad step type, naming the field', async () => {
      const { curatedDir } = writeFixture({
        title: 'Broken',
        sections: [
          { title: 'A section', steps: [{ alias: 'a', type: 'not_a_real_step_type', title: 'A' }] },
        ],
      });

      await expect(
        generateMarketplaceBundles({ curatedDir, outDir: makeTmpDir('ezb-marketplace-out-') })
      ).rejects.toThrow(/sections\.0\.steps\.0\.type/);
    });
  });

  it('parseCuratedWorkflow surfaces invalid JSON with the file path', () => {
    expect(() => parseCuratedWorkflow('/fake/path/workflow.json', '{ not valid json')).toThrow(
      /\/fake\/path\/workflow\.json/
    );
  });

  // AC1: "Wire it into npm run build before the server build."
  it('is wired into npm run build, running before the esbuild server bundle step', () => {
    const packageJsonPath = path.resolve(__dirname, '../../../package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts['build:marketplace']).toContain('scripts/generateMarketplaceBundles.ts');

    const buildScript = pkg.scripts.build;
    const marketplaceIndex = buildScript.indexOf('build:marketplace');
    const esbuildIndex = buildScript.indexOf('esbuild server/production.ts');
    expect(marketplaceIndex).toBeGreaterThan(-1);
    expect(esbuildIndex).toBeGreaterThan(-1);
    expect(marketplaceIndex).toBeLessThan(esbuildIndex);
  });
});
