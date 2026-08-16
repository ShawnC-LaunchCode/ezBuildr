import * as fs from 'fs';
import * as path from 'path';

/**
 * The migration chain's current head tag, read from `migrations/meta/_journal.json`.
 *
 * Resolved via `process.cwd()`, which is correct both at server runtime (the
 * process always starts from the repo root) and at build time (`npm run
 * build` and the scripts it shells out to also run from the repo root).
 *
 * Shared by `ExportService` (real exports, run against a live DB) and
 * `scripts/generateMarketplaceBundles.ts` (build-time curated bundles, no DB)
 * so the two can never disagree about what "current head" means — see TM-1.
 * A stale or hardcoded head in either caller would defeat
 * `ImportService.checkMigrationHead`'s drift check.
 */
export function getMigrationHead(): string | null {
  const journalPath = path.resolve(process.cwd(), 'migrations/meta/_journal.json');
  if (!fs.existsSync(journalPath)) {
    throw new Error(`Migration journal not found at ${journalPath}`);
  }
  const content = fs.readFileSync(journalPath, 'utf8');
  const journal = JSON.parse(content) as Record<string, unknown>;
  const entries = journal.entries;
  if (Array.isArray(entries) && entries.length > 0) {
    const lastEntry = entries[entries.length - 1] as Record<string, unknown>;
    if (typeof lastEntry.tag !== 'string') {
      throw new Error('Migration journal contains invalid entry tag');
    }
    return lastEntry.tag;
  }
  return null;
}
