import { createHash, randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type AdmZip from "adm-zip";
import * as schema from "@shared/schema";
// RLS-5: this file is pure FIXTURE construction — it builds the world a suite
// then exercises the app against. That makes it the observer, not the
// application (see tests/helpers/ownerDb.ts), so it writes as the owner and is
// unaffected by whether the app under test is running restricted.
import { getOwnerDb } from "./ownerDb";
import { storageProvider } from "../../server/services/storage";
import { importService, type ImportPreview, type ImportApplyOptions, type ImportApplyResult } from "../../server/services/portability/ImportService";

export function recomputeChecksum(zip: AdmZip, manifest: any): void {
  const hash = createHash("sha256");
  const entries = zip.getEntries();
  const entityEntries = entries
    .filter((e) => e.entryName.startsWith("entities/") && e.entryName.endsWith(".jsonl"))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));
  for (const entry of entityEntries) {
    hash.update(entry.getData());
  }
  const blobEntries = entries
    .filter((e) => e.entryName.startsWith("blobs/") && e.entryName !== "blobs/index.json" && !e.entryName.endsWith("/"))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));
  for (const entry of blobEntries) {
    hash.update(entry.getData());
  }
  const indexEntry = entries.find((e) => e.entryName === "blobs/index.json");
  if (indexEntry) {
    hash.update(indexEntry.getData());
  }
  manifest.checksum = hash.digest("hex");
}

/**
 * ImportService.preview/apply take a file path, not a Buffer (IEX2-10) — the
 * production caller is a multer upload already on disk. Tests still build
 * bundles as Buffers, so spool to a temp file around the real call and clean
 * it up, keeping every existing test's call shape (buffer in, result out).
 */
async function withBundleFile<T>(buffer: Buffer, fn: (filePath: string) => Promise<T>): Promise<T> {
  const filePath = path.join(os.tmpdir(), `test-bundle-${randomUUID()}.ezb`);
  await fs.writeFile(filePath, buffer);
  try {
    return await fn(filePath);
  } finally {
    await fs.rm(filePath, { force: true });
  }
}

export function previewBundle(buffer: Buffer, userId: string, targetProjectId?: string): Promise<ImportPreview> {
  return withBundleFile(buffer, (filePath) => importService.preview(filePath, userId, targetProjectId));
}

export function applyBundle(buffer: Buffer, userId: string, options?: ImportApplyOptions): Promise<ImportApplyResult> {
  return withBundleFile(buffer, (filePath) => importService.apply(filePath, userId, options));
}

/**
 * Fixture builders for the entities a workflow-scope export must reach by
 * *reference* rather than by parent chain (IEX3-1): document templates, which
 * hang off the project, and DataVault databases, which attach by
 * `(scopeType, scopeId)` and may be shared across the tenant.
 *
 * Shared between `portability.export.test.ts` (bundle shape) and
 * `portability.import.test.ts` (round trip) so both exercise the same graph.
 */

/** A workflow with one page and one text step. */
export async function seedWorkflow(opts: {
  projectId: string;
  userId: string;
  title?: string;
}): Promise<{ workflowId: string; pageId: string }> {
  const [workflow] = await getOwnerDb().insert(schema.workflows).values({
    title: opts.title ?? `Fixture Workflow ${randomUUID().slice(0, 8)}`,
    name: "Fixture Workflow",
    projectId: opts.projectId,
    creatorId: opts.userId,
    ownerId: opts.userId,
    ownerType: "user",
    ownerUuid: opts.userId,
  }).returning();

  const [page] = await getOwnerDb().insert(schema.pages).values({
    workflowId: workflow.id,
    title: "Page One",
    order: 0,
  }).returning();

  await getOwnerDb().insert(schema.steps).values({
    workflowId: workflow.id,
    pageId: page.id,
    type: "text",
    title: "Your name",
    alias: "your_name",
    order: 0,
  });

  return { workflowId: workflow.id, pageId: page.id };
}

/**
 * A template with a real stored blob, plus a workflow version that references
 * it. Pass `attachToWorkflowId: null` to create an unreferenced template — the
 * control case proving the export does not sweep in the project's whole
 * template library.
 */
export async function seedTemplate(opts: {
  projectId: string;
  userId: string;
  attachToWorkflowId: string | null;
  name?: string;
}): Promise<{ templateId: string; fileRef: string; workflowVersionId: string | null }> {
  const fileRef = await storageProvider.saveFile(
    Buffer.from(`fixture template body ${randomUUID()}`),
    "fixture-template.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );

  const [template] = await getOwnerDb().insert(schema.templates).values({
    projectId: opts.projectId,
    name: opts.name ?? `Fixture Template ${randomUUID().slice(0, 8)}`,
    type: "docx",
    fileRef,
  }).returning();

  await getOwnerDb().insert(schema.templateVersions).values({
    templateId: template.id,
    versionNumber: 1,
    fileRef,
    createdBy: opts.userId,
    isActive: true,
  });

  if (opts.attachToWorkflowId === null) {
    return { templateId: template.id, fileRef, workflowVersionId: null };
  }

  const [version] = await getOwnerDb().insert(schema.workflowVersions).values({
    workflowId: opts.attachToWorkflowId,
    versionNumber: 1,
    isDraft: false,
    graphJson: {},
    createdBy: opts.userId,
  }).returning();

  await getOwnerDb().insert(schema.workflowTemplates).values({
    workflowVersionId: version.id,
    templateId: template.id,
    key: "primary",
    isPrimary: true,
  });

  return { templateId: template.id, fileRef, workflowVersionId: version.id };
}

/**
 * A DataVault database at the given scope, with one table, one column and one
 * row. When `attachToWorkflowId` is set it is wired to that workflow through
 * both a data source and a query — the two NOT NULL references that make an
 * incomplete bundle un-importable.
 */
export async function seedDatavault(opts: {
  tenantId: string;
  userId: string;
  scopeType: "account" | "project" | "workflow";
  scopeId: string | null;
  attachToWorkflowId: string | null;
  name?: string;
}): Promise<{ databaseId: string; tableId: string; columnId: string; rowId: string }> {
  const [database] = await getOwnerDb().insert(schema.datavaultDatabases).values({
    tenantId: opts.tenantId,
    name: opts.name ?? `Fixture DB ${randomUUID().slice(0, 8)}`,
    type: "native",
    scopeType: opts.scopeType,
    scopeId: opts.scopeId,
    ownerType: "user",
    ownerUuid: opts.userId,
  }).returning();

  const [table] = await getOwnerDb().insert(schema.datavaultTables).values({
    tenantId: opts.tenantId,
    databaseId: database.id,
    name: "States",
    slug: `states-${randomUUID().slice(0, 8)}`,
    ownerType: "user",
    ownerUuid: opts.userId,
  }).returning();

  const [column] = await getOwnerDb().insert(schema.datavaultColumns).values({
    tableId: table.id,
    name: "Code",
    slug: "code",
    type: "text",
    orderIndex: 0,
  }).returning();

  const [row] = await getOwnerDb().insert(schema.datavaultRows).values({
    tableId: table.id,
    createdBy: opts.userId,
  }).returning();

  await getOwnerDb().insert(schema.datavaultValues).values({
    rowId: row.id,
    columnId: column.id,
    value: "CA",
  });

  if (opts.attachToWorkflowId !== null) {
    await getOwnerDb().insert(schema.workflowDataSources).values({
      workflowId: opts.attachToWorkflowId,
      dataSourceId: database.id,
    });
    await getOwnerDb().insert(schema.workflowQueries).values({
      workflowId: opts.attachToWorkflowId,
      dataSourceId: database.id,
      tableId: table.id,
      name: "All states",
    });
  }

  return { databaseId: database.id, tableId: table.id, columnId: column.id, rowId: row.id };
}
