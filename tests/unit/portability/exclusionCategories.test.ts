import { describe, it, expect } from 'vitest';
import { EXCLUSION_CATEGORIES } from '@shared/types/portabilityDisclosure';
import { EXCLUDED_TABLES } from '../../../server/services/portability/entityGraph';

/**
 * IEX3-4. The export dialog tells a user what a bundle leaves behind. That
 * claim is only trustworthy if it is derived from the same list the engine
 * actually enforces — a hand-written summary would drift the first time a
 * table was added, and would then understate what is withheld while looking
 * authoritative.
 */
describe('exclusion categories cover EXCLUDED_TABLES', () => {
  const categorised = EXCLUSION_CATEGORIES.flatMap(c => c.tables);
  const excluded = Object.keys(EXCLUDED_TABLES);

  it('accounts for every excluded table', () => {
    const missing = excluded.filter(t => !categorised.includes(t));
    expect(
      missing,
      `These tables are excluded by the engine but appear in no category, so the ` +
      `export dialog would not mention them. Add each to a category in ` +
      `shared/types/portabilityDisclosure.ts (or create a category for them).`
    ).toEqual([]);
  });

  it('does not claim to exclude anything the engine still exports', () => {
    const phantom = categorised.filter(t => !(t in EXCLUDED_TABLES));
    expect(
      phantom,
      `These tables are listed as excluded in the disclosure but are not in ` +
      `EXCLUDED_TABLES. Telling a user their data stayed behind when it did not ` +
      `is the worst failure this dialog can have.`
    ).toEqual([]);
  });

  it('lists each table in exactly one category', () => {
    const seen = new Map<string, number>();
    for (const table of categorised) {
      seen.set(table, (seen.get(table) ?? 0) + 1);
    }
    const duplicated = [...seen.entries()].filter(([, n]) => n > 1).map(([t]) => t);
    expect(duplicated).toEqual([]);
  });

  it('gives every category a title and a plain-language summary', () => {
    for (const category of EXCLUSION_CATEGORIES) {
      expect(category.title.length).toBeGreaterThan(0);
      expect(category.summary.length).toBeGreaterThan(20);
      expect(category.tables.length).toBeGreaterThan(0);
      // A summary that leaks snake_case identifiers has failed at being the
      // editorial layer. Single English words that happen to match a table
      // name ("organizations") are fine — the test targets `some_table_name`.
      for (const table of category.tables.filter(t => t.includes('_'))) {
        expect(
          category.summary,
          `"${category.title}" names the table ${table} in prose meant for a user`
        ).not.toContain(table);
      }
    }
  });
});
