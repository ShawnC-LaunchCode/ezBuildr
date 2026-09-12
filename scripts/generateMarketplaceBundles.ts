/**
 * Build-time generator: `templates/curated/<slug>/{workflow.json,template.docx}`
 * -> one portability bundle per curated template, under `dist/marketplace/`,
 * plus a machine-readable `index.json` (TM-1).
 *
 * Why this exists: `templates/curated/**` is inert hand-authored content (see
 * `templates/curated/README.md`) and the production Docker image never copies
 * `templates/` at all (`Dockerfile:81-100`). A future marketplace catalog
 * (TM-2) must therefore read pre-built bundles out of `dist/`, never the
 * source directory — this script is what builds them, wired into `npm run
 * build` ahead of the server bundle step.
 *
 * The bundle shape is NOT reinvented here: entity rows are assembled using
 * `ENTITY_GRAPH`'s own field lists (`server/services/portability/entityGraph.ts`)
 * and written with the same `BundleWriter` a real export uses, so the output
 * is byte-for-byte the same *kind* of artifact `ExportService` produces and
 * is readable by the same `BundleReader`. `migrationHead` comes from the
 * shared `getMigrationHead()` (`./migrationHead.ts`) `ExportService` also
 * calls, so the two can never disagree about the current schema head.
 *
 * Runnable standalone for local iteration:
 *   npx tsx scripts/generateMarketplaceBundles.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

import { BundleWriter } from '../server/services/portability/bundleWriter';
import { ENTITY_GRAPH, EntityDescriptor } from '../server/services/portability/entityGraph';
import { BundleManifest, BlobIndex, FORMAT_VERSION } from '../server/services/portability/bundleFormat';
import { getMigrationHead } from '../server/services/portability/migrationHead';
import { parseCuratedWorkflow, CuratedWorkflow } from './curatedWorkflowSchema';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Placeholder for FK columns (`creatorId`, `ownerId`, `projectId`, ...) that
 * point at entities this bundle deliberately does not carry (`users`,
 * `projects` — instance-bound, see `EXCLUDED_TABLES`). `ImportService`
 * overwrites every one of these unconditionally at import time
 * (`enforceOwnership` for user/tenant columns, `resolveProjectIdOverride` +
 * the `REPARENTED_PROJECT_ENTITIES` re-parenting for `projectId` on
 * `workflows`/`templates`), so the value only has to be well-formed, not
 * meaningful.
 */
const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `workflow.json` carries no display taxonomy (LD-2's shape is
 * `{ title, description, settings, pages }` only, and `templates/curated/**`
 * is read-only for this ticket) — so the catalog metadata the marketplace UI
 * needs lives here instead. A curated template directory with no entry fails
 * the build rather than shipping with a guessed category.
 */
const CURATED_METADATA: Record<string, { category: string; tags: string[] }> = {
  nda: { category: 'legal', tags: ['nda', 'confidentiality', 'contract'] },
  'retainer-agreement': { category: 'legal', tags: ['retainer', 'engagement-letter', 'billing'] },
  'intake-questionnaire': { category: 'legal', tags: ['intake', 'client-onboarding'] },
};

export interface MarketplaceIndexEntry {
  slug: string;
  title: string;
  description: string | null;
  category: string;
  tags: string[];
  /** Relative to the directory `index.json` itself lives in. */
  bundlePath: string;
}

export interface GenerateMarketplaceBundlesOptions {
  /** Defaults to `<cwd>/templates/curated`. */
  curatedDir?: string;
  /** Defaults to `<cwd>/dist/marketplace`. */
  outDir?: string;
}

export interface GenerateMarketplaceBundlesResult {
  outDir: string;
  indexPath: string;
  entries: MarketplaceIndexEntry[];
}

function getDescriptor(name: string): EntityDescriptor {
  const found = ENTITY_GRAPH.find((d) => d.name === name);
  if (!found) {
    throw new Error(`generateMarketplaceBundles: entity '${name}' is not defined in ENTITY_GRAPH`);
  }
  return found;
}

/**
 * Builds a row containing exactly `descriptor.fields` — no more, no less —
 * so the generator cannot silently drift from the canonical shape
 * `ENTITY_GRAPH` declares for a real export. A field ENTITY_GRAPH adds or
 * removes later fails this build loudly instead of shipping a bundle
 * `ImportService`'s own `getZodSchema` (which also reads `descriptor.fields`)
 * would reject or silently strip.
 */
function buildRow(descriptor: EntityDescriptor, values: Record<string, unknown>): Record<string, unknown> {
  const declared = new Set(descriptor.fields);
  const provided = new Set(Object.keys(values));
  const missing = descriptor.fields.filter((f) => !provided.has(f));
  const extra = [...provided].filter((f) => !declared.has(f));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `generateMarketplaceBundles: assembled row for '${descriptor.name}' does not match its ` +
        `ENTITY_GRAPH field list (missing=[${missing.join(', ')}] extra=[${extra.join(', ')}])`
    );
  }
  return values;
}

function readAppVersion(): string {
  const packagePath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error(`generateMarketplaceBundles: package.json not found at ${packagePath}`);
  }
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as Record<string, unknown>;
  if (typeof pkg.version !== 'string') {
    throw new Error('generateMarketplaceBundles: package.json does not contain a valid version string');
  }
  return pkg.version;
}

interface BuiltStep {
  row: Record<string, unknown>;
  graph: Record<string, unknown>;
}

interface BuiltPage {
  row: Record<string, unknown>;
  graph: Record<string, unknown>;
  steps: BuiltStep[];
}

interface BuiltWorkflow {
  workflowId: string;
  workflowVersionId: string;
  workflowRow: Record<string, unknown>;
  workflowVersionRow: Record<string, unknown>;
  pages: BuiltPage[];
}

/**
 * Assembles `workflows` + `pages` + `steps` + `workflow_versions` rows
 * from one curated `workflow.json`.
 *
 * `workflow_versions.graphJson` is NOT NULL and is not a graph-builder
 * relic here — `RunDefinitionProvider`'s `VersionRuntimeSchema` still reads
 * it to run a published workflow, so a stub value would leave the imported
 * template inert. The snapshot below is built from the exact same page/
 * step objects written to the `pages`/`steps` entity rows, so the two
 * representations cannot drift apart.
 */
function buildWorkflowEntities(workflow: CuratedWorkflow): BuiltWorkflow {
  const workflowsDesc = getDescriptor('workflows');
  const pagesDesc = getDescriptor('pages');
  const stepsDesc = getDescriptor('steps');
  const workflowVersionsDesc = getDescriptor('workflow_versions');

  const workflowId = randomUUID();
  const workflowVersionId = randomUUID();

  // `settings.intakeConfig` in the curated JSON targets the real, separate
  // `workflows.intakeConfig` column (see templates/curated/README.md); the
  // rest of `settings` targets `workflows.settings` (businessDayCalendar, ...).
  const rawSettings: Record<string, unknown> = { ...(workflow.settings ?? {}) };
  const intakeConfig = rawSettings.intakeConfig ?? {};
  delete rawSettings.intakeConfig;

  const pages: BuiltPage[] = workflow.pages.map((page, pageIndex) => {
    const pageId = randomUUID();

    const steps: BuiltStep[] = page.steps.map((step, stepIndex) => {
      const stepId = randomUUID();
      const config = step.config ?? null;
      const visibleIf = step.visibleIf ?? null;
      const required = step.required ?? false;

      const row = buildRow(stepsDesc, {
        id: stepId,
        workflowId,
        pageId,
        type: step.type,
        title: step.title,
        description: null,
        required,
        config,
        alias: step.alias,
        defaultValue: null,
        order: stepIndex,
        isVirtual: false,
        visibleIf,
      });

      const graph = {
        id: stepId,
        type: step.type,
        title: step.title,
        description: null,
        required,
        config,
        order: stepIndex,
        alias: step.alias,
        visibleIf,
        defaultValue: null,
        isVirtual: false,
      };

      return { row, graph };
    });

    const row = buildRow(pagesDesc, {
      id: pageId,
      workflowId,
      sectionId: null,
      title: page.title,
      description: null,
      order: pageIndex,
      config: {},
      visibleIf: null,
    });

    const graph = {
      id: pageId,
      sectionId: null,
      title: page.title,
      description: null,
      order: pageIndex,
      visibleIf: null,
      config: {},
      steps: steps.map((s) => s.graph),
    };

    return { row, graph, steps };
  });

  const workflowRow = buildRow(workflowsDesc, {
    id: workflowId,
    title: workflow.title,
    name: workflow.title,
    description: workflow.description ?? null,
    creatorId: PLACEHOLDER_ID,
    ownerId: PLACEHOLDER_ID,
    modeOverride: null,
    publicLink: null,
    projectId: PLACEHOLDER_ID,
    currentVersionId: workflowVersionId,
    isPublic: false,
    slug: null,
    requireLogin: false,
    intakeConfig,
    settings: rawSettings,
    pinnedVersionId: null,
    status: 'draft',
    ownerType: null,
    ownerUuid: null,
    sourceBlueprintId: null,
  });

  const graphJson = {
    title: workflow.title,
    description: workflow.description ?? null,
    projectId: null,
    intakeConfig,
    settings: rawSettings,
    pages: pages.map((s) => s.graph),
    logicRules: [],
  };

  const workflowVersionRow = buildRow(workflowVersionsDesc, {
    id: workflowVersionId,
    workflowId,
    baseId: null,
    versionNumber: 1,
    isDraft: true,
    graphJson,
    migrationInfo: null,
    changelog: null,
    notes: null,
    checksum: null,
    createdBy: PLACEHOLDER_ID,
    published: false,
    publishedAt: null,
  });

  return { workflowId, workflowVersionId, workflowRow, workflowVersionRow, pages };
}

interface BuiltTemplate {
  fileRef: string;
  templateRow: Record<string, unknown>;
  templateVersionRow: Record<string, unknown>;
  workflowTemplateRow: Record<string, unknown>;
}

/** Assembles `templates` + `template_versions` + `workflow_templates` rows for one docx. */
function buildTemplateEntities(params: {
  slug: string;
  workflow: CuratedWorkflow;
  workflowVersionId: string;
}): BuiltTemplate {
  const { slug, workflow, workflowVersionId } = params;
  const templatesDesc = getDescriptor('templates');
  const templateVersionsDesc = getDescriptor('template_versions');
  const workflowTemplatesDesc = getDescriptor('workflow_templates');

  const templateId = randomUUID();
  // Not a real storage key (no storageProvider involved at build time) - just
  // the blob index key that ties templates.fileRef/template_versions.fileRef
  // to the blob ImportService restores into the importing tenant's storage.
  const fileRef = `curated/${slug}/template.docx`;

  const templateRow = buildRow(templatesDesc, {
    id: templateId,
    projectId: PLACEHOLDER_ID,
    name: workflow.title,
    description: workflow.description ?? null,
    fileRef,
    type: 'docx',
    helpersVersion: 1,
    metadata: {},
    mapping: {},
    currentVersion: 1,
    lastModifiedBy: PLACEHOLDER_ID,
  });

  const templateVersionRow = buildRow(templateVersionsDesc, {
    id: randomUUID(),
    templateId,
    versionNumber: 1,
    fileRef,
    metadata: {},
    mapping: {},
    createdBy: PLACEHOLDER_ID,
    notes: null,
    isActive: true,
  });

  const workflowTemplateRow = buildRow(workflowTemplatesDesc, {
    id: randomUUID(),
    workflowVersionId,
    templateId,
    key: 'primary',
    isPrimary: true,
  });

  return { fileRef, templateRow, templateVersionRow, workflowTemplateRow };
}

async function generateBundleForTemplate(params: {
  slug: string;
  curatedDir: string;
  outDir: string;
}): Promise<MarketplaceIndexEntry> {
  const { slug, curatedDir, outDir } = params;
  const templateDir = path.join(curatedDir, slug);
  const workflowJsonPath = path.join(templateDir, 'workflow.json');
  const docxPath = path.join(templateDir, 'template.docx');

  if (!fs.existsSync(workflowJsonPath)) {
    throw new Error(`generateMarketplaceBundles: missing workflow.json at ${workflowJsonPath}`);
  }

  // Validate workflow.json before touching anything else, so a malformed
  // file fails on its own terms rather than being masked by a missing docx
  // or a missing catalog entry.
  const workflow = parseCuratedWorkflow(workflowJsonPath, fs.readFileSync(workflowJsonPath, 'utf8'));

  if (!fs.existsSync(docxPath)) {
    throw new Error(`generateMarketplaceBundles: missing template.docx at ${docxPath}`);
  }

  const meta = CURATED_METADATA[slug];
  if (!meta) {
    throw new Error(
      `generateMarketplaceBundles: no category/tags metadata registered for curated template ` +
        `'${slug}' - add one to CURATED_METADATA in scripts/generateMarketplaceBundles.ts`
    );
  }

  const docxBuffer = fs.readFileSync(docxPath);
  const sha256 = createHash('sha256').update(docxBuffer).digest('hex');

  const { workflowId, workflowVersionId, workflowRow, workflowVersionRow, pages } =
    buildWorkflowEntities(workflow);
  const { fileRef, templateRow, templateVersionRow, workflowTemplateRow } = buildTemplateEntities({
    slug,
    workflow,
    workflowVersionId,
  });

  const bundlePath = path.join(outDir, `${slug}.ezb`);
  const writer = new BundleWriter(bundlePath);
  let success = false;
  try {
    await writer.writeEntityRow('workflows', workflowRow);
    for (const page of pages) {
      await writer.writeEntityRow('pages', page.row);
      for (const step of page.steps) {
        await writer.writeEntityRow('steps', step.row);
      }
    }
    await writer.writeEntityRow('workflow_versions', workflowVersionRow);
    await writer.writeEntityRow('templates', templateRow);
    await writer.writeEntityRow('template_versions', templateVersionRow);
    await writer.writeEntityRow('workflow_templates', workflowTemplateRow);

    await writer.writeBlob(sha256, docxBuffer);
    const blobIndex: BlobIndex = {
      [fileRef]: { sha256, filename: 'template.docx', mimeType: DOCX_MIME, size: docxBuffer.length },
    };
    await writer.writeBlobIndex(blobIndex);

    const stepCount = pages.reduce((total, page) => total + page.steps.length, 0);
    const manifest: BundleManifest = {
      formatVersion: FORMAT_VERSION,
      appVersion: readAppVersion(),
      migrationHead: getMigrationHead(),
      scope: 'workflow',
      rootIds: [workflowId],
      sourceSystem: 'ezBuildr-marketplace-generator',
      createdAt: new Date().toISOString(),
      entityCounts: {
        workflows: 1,
        pages: pages.length,
        steps: stepCount,
        workflow_versions: 1,
        templates: 1,
        template_versions: 1,
        workflow_templates: 1,
      },
      blobCount: 1,
      checksum: '',
    };

    await writer.writeManifest(manifest);
    await writer.finalize();
    success = true;
  } finally {
    // Mirrors ExportService.exportToFile: finalize() already cleans up on the
    // success path, but calling cleanup() again is safe (idempotent), and
    // this is the only path that reclaims the spool dir on a mid-write failure.
    writer.cleanup();
    if (!success) {
      try {
        fs.rmSync(bundlePath, { force: true });
      } catch {
        // Ignore removal error.
      }
    }
  }

  return {
    slug,
    title: workflow.title,
    description: workflow.description ?? null,
    category: meta.category,
    tags: meta.tags,
    bundlePath: `${slug}.ezb`,
  };
}

/**
 * Generates one bundle per `templates/curated/<slug>/` directory plus an
 * `index.json` naming them all, under `outDir`. Never reads or writes
 * anything outside `curatedDir` (read-only) and `outDir`.
 */
export async function generateMarketplaceBundles(
  options: GenerateMarketplaceBundlesOptions = {}
): Promise<GenerateMarketplaceBundlesResult> {
  const curatedDir = options.curatedDir ?? path.resolve(process.cwd(), 'templates/curated');
  const outDir = options.outDir ?? path.resolve(process.cwd(), 'dist/marketplace');

  if (!fs.existsSync(curatedDir)) {
    throw new Error(`generateMarketplaceBundles: curated templates directory not found at ${curatedDir}`);
  }

  const slugs = fs
    .readdirSync(curatedDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (slugs.length === 0) {
    throw new Error(`generateMarketplaceBundles: no curated template directories found under ${curatedDir}`);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const entries: MarketplaceIndexEntry[] = [];
  for (const slug of slugs) {
    entries.push(await generateBundleForTemplate({ slug, curatedDir, outDir }));
  }

  const indexPath = path.join(outDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(entries, null, 2));

  return { outDir, indexPath, entries };
}

const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  generateMarketplaceBundles()
    .then((result) => {
      console.log(`Generated ${result.entries.length} marketplace bundle(s) in ${result.outDir}`);
      for (const entry of result.entries) {
        console.log(`  - ${entry.slug} -> ${entry.bundlePath}`);
      }
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.stack ?? err.message : err);
      process.exitCode = 1;
    });
}
