import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DiskStorageProvider } from '../../../server/services/storage/DiskStorageProvider';

/**
 * DEBT-5: every disk operation resolves its ref inside the storage root.
 *
 * This matters beyond tidiness because a fileRef is not always trusted input —
 * import writes fileRefs straight out of an uploaded bundle (IEX-10) — and
 * before this guard existed, `path.join(baseDir, '../../.env')` resolved
 * cleanly outside the store.
 */
describe('DiskStorageProvider path containment', () => {
  let baseDir: string;
  let outsideFile: string;
  let provider: DiskStorageProvider;

  beforeAll(async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ezb-storage-'));
    baseDir = path.join(root, 'store');
    await fs.mkdir(baseDir, { recursive: true });

    // A file that genuinely exists, one level above the storage root. Traversal
    // must be refused because it escapes, not because the target is missing.
    outsideFile = path.join(root, 'secret.txt');
    await fs.writeFile(outsideFile, 'top secret');

    provider = new DiskStorageProvider(baseDir);
    await provider.init();
    await provider.uploadFile('nested/legit.txt', Buffer.from('hello'), 'text/plain');
  });

  afterAll(async () => {
    await fs.rm(path.resolve(baseDir, '..'), { recursive: true, force: true });
  });

  const traversals = [
    ['parent-relative', '../secret.txt'],
    ['deep parent-relative', '../../../../../../etc/passwd'],
    ['nested then escaping', 'nested/../../secret.txt'],
    ['backslash separated', '..\\secret.txt'],
  ] as const;

  for (const [label, ref] of traversals) {
    it(`refuses to read an escaping ref (${label})`, async () => {
      await expect(provider.getFile(ref)).rejects.toThrow(/Invalid file path/);
      await expect(provider.getLocalPath(ref)).rejects.toThrow(/Invalid file path/);
      await expect(provider.getMetadata(ref)).rejects.toThrow(/Invalid file path/);
    });
  }

  it('refuses to write outside the storage root', async () => {
    await expect(
      provider.uploadFile('../escaped.txt', Buffer.from('nope'), 'text/plain')
    ).rejects.toThrow(/Invalid file path/);

    const parent = await fs.readdir(path.resolve(baseDir, '..'));
    expect(parent).not.toContain('escaped.txt');
  });

  it('refuses to delete outside the storage root, leaving the target intact', async () => {
    await expect(provider.deleteFile('../secret.txt')).rejects.toThrow(/Invalid file path/);
    await expect(fs.readFile(outsideFile, 'utf8')).resolves.toBe('top secret');
  });

  it('reports an escaping ref as non-existent rather than probing outside', async () => {
    await expect(provider.exists('../secret.txt')).rejects.toThrow(/Invalid file path/);
  });

  it('rejects an absolute ref, which path.join would have kept inside base', async () => {
    // path.join(base, '/etc/passwd') === base/etc/passwd — harmless. But
    // path.resolve escapes, which is why resolve-then-contain is the safe
    // order and why this case is worth pinning.
    await expect(provider.getFile(outsideFile)).rejects.toThrow(/Invalid file path/);
  });

  it('still resolves legitimate refs, including nested ones', async () => {
    await expect(provider.getFile('nested/legit.txt')).resolves.toEqual(Buffer.from('hello'));

    const localPath = await provider.getLocalPath('nested/legit.txt');
    expect(localPath).toBe(path.resolve(baseDir, 'nested/legit.txt'));
    expect(await provider.exists('nested/legit.txt')).toBe(true);

    // The root itself resolves to base rather than being treated as an escape.
    await expect(provider.list('')).resolves.toContain('nested');
  });
});
