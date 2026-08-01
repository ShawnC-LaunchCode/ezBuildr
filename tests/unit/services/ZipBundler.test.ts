import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createZipArchive } from '../../../server/services/document/ZipBundler';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe('ZipBundler', () => {
  it('creates a non-empty ZIP with Archiver v8', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ezbuildr-zip-'));
    temporaryDirectories.push(directory);
    const sourcePath = path.join(directory, 'source.txt');
    const outputPath = path.join(directory, 'output');
    await fs.writeFile(sourcePath, 'client document', 'utf8');

    const result = await createZipArchive(
      [{ filename: 'client document.txt', filePath: sourcePath }],
      'client bundle',
      outputPath,
      { includeManifest: true }
    );

    const stats = await fs.stat(result.filePath);
    expect(result.filename).toBe('client_bundle.zip');
    expect(result.fileCount).toBe(1);
    expect(stats.size).toBeGreaterThan(0);
  });
});
