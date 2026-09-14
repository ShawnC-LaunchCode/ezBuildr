/**
 * One-time repair: convert stored DOCX templates from the deleted prefix grammar
 * (`{{defaultValue x "y"}}`) to the pipe grammar (`{{ x | defaultValue:"y" }}`).
 * See server/services/document/legacyTagMigration.ts for what converts and why.
 *
 * Run inside an environment so its storage and database are the ones touched:
 *
 *   railway run --environment <env> -- npx tsx scripts/migrate-legacy-template-tags.ts            # DRY RUN
 *   railway run --environment <env> -- npx tsx scripts/migrate-legacy-template-tags.ts --apply    # write
 *   railway run --environment <env> -- npx tsx scripts/migrate-legacy-template-tags.ts --rollback <report.json>
 *
 * Nothing is overwritten. --apply uploads each converted file under a NEW storage
 * key and repoints every `templates` row that used the old key, in one transaction;
 * the original objects stay where they were. It writes a report (old -> new key per
 * file) that --rollback reads to point the rows back.
 *
 * A file is written only if, after conversion, (1) nothing that still looks like
 * the prefix form remains and (2) every tag compiles with the real renderer.
 * Otherwise it is reported and skipped. `templates` and `template_versions`
 * carry no RLS policy, so the app's own DATABASE_URL can do this.
 */
import fs from 'node:fs';

import { eq, inArray } from 'drizzle-orm';
import PizZip from 'pizzip';

import { templates, templateVersions } from '@shared/schema';

import { db, initializeDatabase } from '../server/db';
import { docxHelpers } from '../server/services/docxHelpers';
import { convertLegacyPrefixTags } from '../server/services/document/legacyTagMigration';
import { createDocxRenderer } from '../server/services/document/RenderCore';
import { storageProvider } from '../server/services/storage';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const FILTERS = new Set(Object.keys(docxHelpers));

interface ReportEntry { oldRef: string; newRef: string; rows: number; tags: number }

function compiles(buffer: Buffer): string | null {
  try {
    // Construction compiles every tag; that is where prefix-form tags failed.
    createDocxRenderer(new PizZip(buffer), {});
    return null;
  } catch (error) {
    const errors = (error as { properties?: { errors?: Array<{ properties?: { xtag?: string } }> } }).properties?.errors;
    return errors?.map((e) => e.properties?.xtag).filter(Boolean).slice(0, 5).join(' | ') || (error as Error).message;
  }
}

async function rollback(reportPath: string): Promise<void> {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as ReportEntry[];
  await db.transaction(async (tx) => {
    for (const { oldRef, newRef } of report) {
      const rows = await tx.update(templates).set({ fileRef: oldRef }).where(eq(templates.fileRef, newRef)).returning({ id: templates.id });
      console.log(`rolled back ${newRef} -> ${oldRef} (${rows.length} row(s))`);
    }
  });
}

async function migrate(apply: boolean): Promise<void> {
  const rows = await db.select({ id: templates.id, fileRef: templates.fileRef, name: templates.name }).from(templates);
  const byRef = new Map<string, string[]>();
  for (const row of rows) {
    if (row.fileRef) { byRef.set(row.fileRef, [...(byRef.get(row.fileRef) ?? []), row.name]); }
  }
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${rows.length} template rows, ${byRef.size} distinct files\n`);

  const planned: Array<{ oldRef: string; buffer: Buffer; rows: number; tags: number }> = [];
  let clean = 0; let missing = 0; let blocked = 0;
  for (const [ref, names] of byRef) {
    let original: Buffer;
    try {
      original = await storageProvider.getFile(ref);
    } catch {
      console.log(`  MISSING  ${ref}  (${names[0]}) — no file in this environment's storage`);
      missing++;
      continue;
    }
    const result = convertLegacyPrefixTags(original, FILTERS);
    if (result.converted.length === 0 && result.unconvertible.length === 0) { clean++; continue; }

    const compileError = compiles(result.buffer);
    if (result.unconvertible.length > 0 || compileError !== null) {
      blocked++;
      console.log(`  BLOCKED  ${ref}  (${names[0]})`);
      for (const u of result.unconvertible) { console.log(`             ${u.reason}: ${u.tag}`); }
      if (compileError !== null) { console.log(`             still fails to compile: ${compileError}`); }
      continue;
    }
    console.log(`  CONVERT  ${ref}  ${result.converted.length} tags, ${names.length} row(s)  (${names[0]})`);
    console.log(`             e.g. ${result.converted[0].from}  ->  ${result.converted[0].to}`);
    planned.push({ oldRef: ref, buffer: result.buffer, rows: names.length, tags: result.converted.length });
  }

  console.log(`\n${planned.length} to convert, ${clean} already clean, ${missing} missing, ${blocked} blocked.`);

  // A template version pins its own file_ref, so repointing only `templates`
  // would leave a version of a converted file on the unconverted one. Only
  // versions of files THIS run would convert matter: dev had 2 versions of
  // unrelated templates, and refusing on any version at all aborted even the
  // dry run there.
  const pinnedVersions = planned.length > 0
    ? await db.select({ ref: templateVersions.fileRef }).from(templateVersions)
      .where(inArray(templateVersions.fileRef, planned.map((p) => p.oldRef)))
    : [];
  if (pinnedVersions.length > 0) {
    const message = `${pinnedVersions.length} template_versions row(s) pin a file this would convert — extend this script to repoint them`;
    if (apply) { throw new Error(`${message} before applying.`); }
    console.log(`WARNING: ${message}.`);
  }
  if (!apply || planned.length === 0) {
    if (!apply) { console.log('Dry run: nothing written. Re-run with --apply.'); }
    return;
  }

  // Upload first (new keys; originals untouched), then repoint rows in one transaction.
  const report: ReportEntry[] = [];
  for (const p of planned) {
    const newRef = await storageProvider.saveFile(p.buffer, p.oldRef, DOCX_MIME);
    report.push({ oldRef: p.oldRef, newRef, rows: p.rows, tags: p.tags });
  }
  await db.transaction(async (tx) => {
    for (const r of report) {
      const updated = await tx.update(templates).set({ fileRef: r.newRef, updatedAt: new Date() })
        .where(eq(templates.fileRef, r.oldRef)).returning({ id: templates.id });
      if (updated.length !== r.rows) { throw new Error(`${r.oldRef}: expected ${r.rows} rows, updated ${updated.length} — rolled back`); }
    }
  });
  const reportPath = `template-tag-migration-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const stillOld = await db.select({ id: templates.id }).from(templates).where(inArray(templates.fileRef, report.map((r) => r.oldRef)));
  console.log(`\nAPPLIED: ${report.length} files converted, rows repointed; rows still on an old key: ${stillOld.length}.`);
  console.log(`Report (needed for --rollback): ${reportPath}`);
}

async function main(): Promise<void> {
  await initializeDatabase();
  const rollbackIdx = process.argv.indexOf('--rollback');
  if (rollbackIdx !== -1) {
    const reportPath = process.argv[rollbackIdx + 1];
    if (!reportPath) { throw new Error('--rollback needs the report path'); }
    await rollback(reportPath);
  } else {
    await migrate(process.argv.includes('--apply'));
  }
}

main().then(() => process.exit(0), (error: unknown) => {
  console.error(`\nABORTED: ${(error as Error).message}`);
  process.exit(1);
});
