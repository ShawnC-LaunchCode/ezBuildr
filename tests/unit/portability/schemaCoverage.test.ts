import { describe, it, expect } from 'vitest';
import * as schema from '@shared/schema';
import { getTableName } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { ENTITY_GRAPH, EXCLUDED_TABLES } from '../../../server/services/portability/entityGraph';

const SCHEMA_DIR = path.resolve(process.cwd(), 'shared/schema');

/**
 * Table names declared anywhere under `shared/schema/`, read from source.
 *
 * The barrel (`shared/schema/index.ts`) is NOT the authority here: a domain
 * file that nobody re-exports is invisible to `import * as schema`, so a
 * namespace-only sweep silently skips its tables. `files.ts` was exactly that
 * case, which is why this test reads the directory instead.
 */
function declaredTableNames(): Set<string> {
  const names = new Set<string>();
  for (const file of fs.readdirSync(SCHEMA_DIR)) {
    if (!file.endsWith('.ts')) {
      continue;
    }
    const source = fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8');
    for (const match of source.matchAll(/=\s*pgTable\(\s*["']([a-z_]+)["']/g)) {
      names.add(match[1]);
    }
  }
  return names;
}

describe('Schema Portability Coverage', () => {
  const exportedTables = Object.entries(schema)
    .filter(([_, val]) => {
      try {
        return val && typeof val === 'object' && getTableName(val as any) !== undefined;
      } catch (e) {
        return false;
      }
    })
    .map(([exportName, val]) => ({
      exportName,
      tableName: getTableName(val as any)
    }));

  it('every table declared under shared/schema/ is reachable from the barrel', () => {
    const reachable = new Set(exportedTables.map(t => t.tableName));
    const unreachable = [...declaredTableNames()].filter(t => !reachable.has(t));

    expect(
      unreachable,
      `Tables declared in shared/schema/ but not exported from shared/schema/index.ts.\n` +
      `Add the missing \`export * from "./<file>"\` to the barrel — until you do, ` +
      `portability classification cannot see these tables.`
    ).toEqual([]);
  });

  it('every table must be classified', () => {
    const unclassified: string[] = [];
    const both: string[] = [];

    // Union of both sweeps: a table hidden from the barrel still has to be
    // classified, so a missing re-export cannot buy an exemption.
    const allTableNames = new Set([
      ...exportedTables.map(t => t.tableName),
      ...declaredTableNames(),
    ]);

    for (const tableName of allTableNames) {
      const inGraph = ENTITY_GRAPH.some(e => e.name === tableName);
      const inExcluded = tableName in EXCLUDED_TABLES;

      if (!inGraph && !inExcluded) {
        unclassified.push(tableName);
      } else if (inGraph && inExcluded) {
        both.push(tableName);
      }
    }

    expect(
      unclassified,
      `Table(s) not classified for portability.\n` +
      `Add each to ENTITY_GRAPH (with a default-deny \`fields\` list) or to\n` +
      `EXCLUDED_TABLES (with a reason) in server/services/portability/entityGraph.ts.`
    ).toEqual([]);

    expect(
      both,
      'Tables present in BOTH ENTITY_GRAPH and EXCLUDED_TABLES — pick one.'
    ).toEqual([]);
  });

  it('every classified table must actually exist in the schema', () => {
    const validTableNames = new Set([
      ...exportedTables.map(t => t.tableName),
      ...declaredTableNames(),
    ]);
    const invalidGraph = ENTITY_GRAPH.filter(e => !validTableNames.has(e.name)).map(e => e.name);
    const invalidExcluded = Object.keys(EXCLUDED_TABLES).filter(t => !validTableNames.has(t));

    expect(
      invalidGraph,
      'ENTITY_GRAPH names tables that no longer exist — delete the descriptors.'
    ).toEqual([]);

    expect(
      invalidExcluded,
      'EXCLUDED_TABLES names tables that no longer exist — delete the entries.'
    ).toEqual([]);
  });
});
