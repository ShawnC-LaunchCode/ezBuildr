/**
 * SECT-1/SECT-2 vertical contract proof.
 *
 * Exercises the real HTTP → service → repository → physical table hop,
 * then the real publish → graph_json → run runtime hop. No repository, DB, or
 * runtime provider is mocked in this file.
 */
import { randomUUID } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { eq, getTableName, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@shared/schema";

import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from "../helpers/integrationTestHelper";
import { getOwnerDb } from "../helpers/ownerDb";

const migrationNames = readdirSync(join(process.cwd(), "migrations"))
  .filter((name) => name.startsWith("0038_") && name.endsWith(".sql"));
const migrationSql = migrationNames.length === 1
  ? readFileSync(join(process.cwd(), "migrations", migrationNames[0]), "utf8")
  : "";

describe.sequential("SECT-1/SECT-2 pages API, physical schema, and published runtime contract", () => {
  let owner: IntegrationTestContext;
  let foreignTenant: IntegrationTestContext;

  beforeAll(async () => {
    owner = await setupIntegrationTest({
      tenantName: "SECT-1 page owner",
      createProject: true,
      projectName: "SECT-1 owner project",
      userRole: "admin",
      tenantRole: "owner",
    });
    foreignTenant = await setupIntegrationTest({
      tenantName: "SECT-1 foreign tenant",
      createProject: true,
      projectName: "SECT-1 foreign project",
      userRole: "admin",
      tenantRole: "owner",
    });
  });

  afterAll(async () => {
    await foreignTenant.cleanup();
    await owner.cleanup();
  });

  it("keeps 0038 metadata-only and expresses every physical rename explicitly", () => {
    expect(migrationNames).toHaveLength(1);
    expect(migrationSql).not.toMatch(/\b(?:CREATE|DROP)\s+(?:TABLE|INDEX|POLICY|CONSTRAINT)\b/i);
    expect(migrationSql).not.toContain('DROP TABLE "sections"');

    const requiredRenames = [
      'ALTER TABLE "sections" RENAME TO "pages"',
      'ALTER TABLE "blocks" RENAME COLUMN "section_id" TO "page_id"',
      'ALTER TABLE "lifecycle_hooks" RENAME COLUMN "section_id" TO "page_id"',
      'ALTER TABLE "logic_rules" RENAME COLUMN "target_section_id" TO "target_page_id"',
      'ALTER TABLE "steps" RENAME COLUMN "section_id" TO "page_id"',
      'ALTER TABLE "transform_blocks" RENAME COLUMN "section_id" TO "page_id"',
      'ALTER TABLE "workflow_runs" RENAME COLUMN "current_section_id" TO "current_page_id"',
      'ALTER TABLE "ai_workflow_feedback" RENAME COLUMN "generated_sections" TO "generated_pages"',
      'ALTER TABLE "pages" RENAME CONSTRAINT "sections_pkey" TO "pages_pkey"',
      'ALTER TABLE "pages" RENAME CONSTRAINT "sections_workflow_id_workflows_id_fk" TO "pages_workflow_id_workflows_id_fk"',
      'ALTER TABLE "blocks" RENAME CONSTRAINT "blocks_section_id_sections_id_fk" TO "blocks_page_id_pages_id_fk"',
      'ALTER TABLE "lifecycle_hooks" RENAME CONSTRAINT "lifecycle_hooks_section_id_sections_id_fk" TO "lifecycle_hooks_page_id_pages_id_fk"',
      'ALTER TABLE "logic_rules" RENAME CONSTRAINT "logic_rules_target_section_id_sections_id_fk" TO "logic_rules_target_page_id_pages_id_fk"',
      'ALTER TABLE "steps" RENAME CONSTRAINT "steps_section_id_sections_id_fk" TO "steps_page_id_pages_id_fk"',
      'ALTER TABLE "transform_blocks" RENAME CONSTRAINT "transform_blocks_section_id_sections_id_fk" TO "transform_blocks_page_id_pages_id_fk"',
      'ALTER TABLE "workflow_runs" RENAME CONSTRAINT "workflow_runs_current_section_id_sections_id_fk" TO "workflow_runs_current_page_id_pages_id_fk"',
      'ALTER INDEX "sections_workflow_idx" RENAME TO "pages_workflow_idx"',
      'ALTER INDEX "sections_deleted_at_idx" RENAME TO "pages_deleted_at_idx"',
      'ALTER INDEX "steps_section_idx" RENAME TO "steps_page_idx"',
      'ALTER INDEX "workflow_runs_current_section_idx" RENAME TO "workflow_runs_current_page_idx"',
    ];
    for (const rename of requiredRenames) {
      expect(migrationSql).toContain(rename);
    }
  });

  it("applies 0038 to pre-0038 objects without replacing data, constraints, indexes, or policy OIDs", async () => {
    const fixtureSchema = `sect2_prehead_${randomUUID().replaceAll("-", "")}`;
    const ownerDb = getOwnerDb();
    await ownerDb.execute(sql.raw(`CREATE SCHEMA "${fixtureSchema}"`));
    try {
      await ownerDb.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL search_path TO "${fixtureSchema}", public`));
        await tx.execute(sql.raw(`
          CREATE TABLE workflows (id uuid PRIMARY KEY);
          CREATE TABLE sections (id uuid CONSTRAINT sections_pkey PRIMARY KEY, workflow_id uuid NOT NULL,
            CONSTRAINT sections_workflow_id_workflows_id_fk FOREIGN KEY (workflow_id) REFERENCES workflows(id));
          CREATE TABLE blocks (section_id uuid, CONSTRAINT blocks_section_id_sections_id_fk FOREIGN KEY (section_id) REFERENCES sections(id));
          CREATE TABLE lifecycle_hooks (section_id uuid, CONSTRAINT lifecycle_hooks_section_id_sections_id_fk FOREIGN KEY (section_id) REFERENCES sections(id));
          CREATE TABLE logic_rules (target_section_id uuid, CONSTRAINT logic_rules_target_section_id_sections_id_fk FOREIGN KEY (target_section_id) REFERENCES sections(id));
          CREATE TABLE steps (section_id uuid, CONSTRAINT steps_section_id_sections_id_fk FOREIGN KEY (section_id) REFERENCES sections(id));
          CREATE TABLE transform_blocks (section_id uuid, CONSTRAINT transform_blocks_section_id_sections_id_fk FOREIGN KEY (section_id) REFERENCES sections(id));
          CREATE TABLE workflow_runs (current_section_id uuid, CONSTRAINT workflow_runs_current_section_id_sections_id_fk FOREIGN KEY (current_section_id) REFERENCES sections(id));
          CREATE TABLE ai_workflow_feedback (generated_sections integer);
          CREATE INDEX sections_workflow_idx ON sections(workflow_id);
          CREATE INDEX sections_deleted_at_idx ON sections(id);
          CREATE INDEX steps_section_idx ON steps(section_id);
          CREATE INDEX workflow_runs_current_section_idx ON workflow_runs(current_section_id);
          ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
          CREATE POLICY tenant_isolation ON sections USING (workflow_id IS NOT NULL);
          INSERT INTO workflows VALUES ('00000000-0000-0000-0000-000000000001');
          INSERT INTO sections VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001');
        `));
        const before = await tx.execute(sql.raw(`
          SELECT c.oid::text AS table_oid, p.oid::text AS policy_oid
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_policy p ON p.polrelid = c.oid AND p.polname = 'tenant_isolation'
          WHERE n.nspname = '${fixtureSchema}' AND c.relname = 'sections'
        `));
        await tx.execute(sql.raw(migrationSql));
        const after = await tx.execute(sql.raw(`
          SELECT c.oid::text AS table_oid, p.oid::text AS policy_oid,
                 (SELECT count(*)::int FROM pages) AS page_count
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_policy p ON p.polrelid = c.oid AND p.polname = 'tenant_isolation'
          WHERE n.nspname = '${fixtureSchema}' AND c.relname = 'pages'
        `));
        expect(after.rows).toEqual([
          { ...before.rows[0], page_count: 1 },
        ]);
      });
    } finally {
      await ownerDb.execute(sql.raw(`DROP SCHEMA IF EXISTS "${fixtureSchema}" CASCADE`));
    }
  });

  it("loads pages from the physical table, publishes graph_json.pages, and serves them to a completed run", async () => {
    const enumResult = await getOwnerDb().execute(sql`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = current_schema()
        AND t.typname IN ('logic_rule_target_type', 'block_phase')
      ORDER BY t.typname, e.enumsortorder
    `);
    const enumRows = enumResult.rows as Array<{ typname: string; enumlabel: string }>;
    const targetLabels = enumRows
      .filter((row) => row.typname === "logic_rule_target_type")
      .map((row) => row.enumlabel);
    const blockPhases = enumRows
      .filter((row) => row.typname === "block_phase")
      .map((row) => row.enumlabel);
    expect(targetLabels).toEqual(["page", "step"]);
    expect(blockPhases).toEqual([
      "onRunStart",
      "onPageEnter",
      "onPageSubmit",
      "onNext",
      "onRunComplete",
    ]);

    const catalogResult = await getOwnerDb().execute(sql`
      SELECT table_name, column_name, column_default
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (
          (table_name = 'pages' AND column_name IN ('id', 'section_id'))
          OR (table_name = 'sections' AND column_name IN ('id', 'workflow_id'))
          OR (table_name = 'steps' AND column_name = 'page_id')
          OR (table_name = 'blocks' AND column_name = 'page_id')
          OR (table_name = 'lifecycle_hooks' AND column_name = 'page_id')
          OR (table_name = 'logic_rules' AND column_name = 'target_page_id')
          OR (table_name = 'transform_blocks' AND column_name IN ('page_id', 'phase'))
          OR (table_name = 'workflow_runs' AND column_name = 'current_page_id')
          OR (table_name = 'ai_workflow_feedback' AND column_name = 'generated_pages')
        )
      ORDER BY table_name, column_name
    `);
    expect(catalogResult.rows).toEqual([
      { table_name: "ai_workflow_feedback", column_name: "generated_pages", column_default: null },
      { table_name: "blocks", column_name: "page_id", column_default: null },
      { table_name: "lifecycle_hooks", column_name: "page_id", column_default: null },
      { table_name: "logic_rules", column_name: "target_page_id", column_default: null },
      { table_name: "pages", column_name: "id", column_default: "gen_random_uuid()" },
      { table_name: "pages", column_name: "section_id", column_default: null },
      { table_name: "sections", column_name: "id", column_default: "gen_random_uuid()" },
      { table_name: "sections", column_name: "workflow_id", column_default: null },
      { table_name: "steps", column_name: "page_id", column_default: null },
      { table_name: "transform_blocks", column_name: "page_id", column_default: null },
      { table_name: "transform_blocks", column_name: "phase", column_default: "'onPageSubmit'::block_phase" },
      { table_name: "workflow_runs", column_name: "current_page_id", column_default: null },
    ]);

    const legacyCatalog = await getOwnerDb().execute(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (
          column_name IN ('target_section_id', 'current_section_id', 'generated_sections')
          OR (column_name = 'section_id' AND table_name <> 'pages')
          OR (table_name = 'sections' AND column_name IN ('order', 'deleted_at'))
        )
    `);
    expect(legacyCatalog.rows).toEqual([]);

    const indexResult = await getOwnerDb().execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'pages_workflow_idx', 'pages_deleted_at_idx', 'steps_page_idx',
          'workflow_runs_current_page_idx', 'sections_workflow_idx',
          'sections_deleted_at_idx', 'steps_section_idx', 'workflow_runs_current_section_idx'
        )
      ORDER BY indexname
    `);
    expect(indexResult.rows).toEqual([
      { indexname: "pages_deleted_at_idx" },
      { indexname: "pages_workflow_idx" },
      { indexname: "sections_workflow_idx" },
      { indexname: "steps_page_idx" },
      { indexname: "workflow_runs_current_page_idx" },
    ]);

    const constraintResult = await getOwnerDb().execute(sql`
      SELECT conname, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = current_schema()
        AND (
          conname IN (
            'pages_pkey', 'pages_workflow_id_workflows_id_fk', 'blocks_page_id_pages_id_fk',
            'lifecycle_hooks_page_id_pages_id_fk', 'logic_rules_target_page_id_pages_id_fk',
            'steps_page_id_pages_id_fk', 'transform_blocks_page_id_pages_id_fk',
            'workflow_runs_current_page_id_pages_id_fk'
          )
          OR conname LIKE '%section_id_sections_id_fk'
          OR conname = 'sections_pkey'
          OR conname = 'sections_workflow_id_workflows_id_fk'
        )
      ORDER BY conname
    `);
    const constraints = constraintResult.rows as Array<{ conname: string; definition: string }>;
    expect(constraints.map(({ conname }) => conname)).toEqual([
      "blocks_page_id_pages_id_fk",
      "lifecycle_hooks_page_id_pages_id_fk",
      "logic_rules_target_page_id_pages_id_fk",
      "pages_pkey",
      "pages_section_id_sections_id_fk",
      "pages_workflow_id_workflows_id_fk",
      "sections_pkey",
      "sections_workflow_id_workflows_id_fk",
      "steps_page_id_pages_id_fk",
      "transform_blocks_page_id_pages_id_fk",
      "workflow_runs_current_page_id_pages_id_fk",
    ]);
    const definitions = Object.fromEntries(
      constraints.map(({ conname, definition }) => [conname, definition]),
    );
    expect(definitions.pages_pkey).toBe("PRIMARY KEY (id)");
    expect(definitions.sections_pkey).toBe("PRIMARY KEY (id)");
    expect(definitions.pages_workflow_id_workflows_id_fk).toContain("FOREIGN KEY (workflow_id) REFERENCES workflows(id)");
    expect(definitions.pages_section_id_sections_id_fk).toContain("FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL");
    expect(definitions.sections_workflow_id_workflows_id_fk).toContain("FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE");
    expect(definitions.blocks_page_id_pages_id_fk).toContain("FOREIGN KEY (page_id) REFERENCES pages(id)");
    expect(definitions.lifecycle_hooks_page_id_pages_id_fk).toContain("FOREIGN KEY (page_id) REFERENCES pages(id)");
    expect(definitions.logic_rules_target_page_id_pages_id_fk).toContain("FOREIGN KEY (target_page_id) REFERENCES pages(id)");
    expect(definitions.steps_page_id_pages_id_fk).toContain("FOREIGN KEY (page_id) REFERENCES pages(id)");
    expect(definitions.transform_blocks_page_id_pages_id_fk).toContain("FOREIGN KEY (page_id) REFERENCES pages(id)");
    expect(definitions.workflow_runs_current_page_id_pages_id_fk).toContain("FOREIGN KEY (current_page_id) REFERENCES pages(id)");

    const policyResult = await getOwnerDb().execute(sql`
      SELECT c.relrowsecurity AS rls_enabled, p.polname AS policy_name,
             pg_get_expr(p.polqual, p.polrelid) AS using_expression,
             pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_policy p ON p.polrelid = c.oid
      WHERE n.nspname = current_schema() AND c.relname = 'pages'
    `);
    expect(policyResult.rows).toHaveLength(1);
    expect(policyResult.rows[0]).toMatchObject({
      rls_enabled: true,
      policy_name: "tenant_isolation",
    });
    expect(String(policyResult.rows[0].using_expression)).toContain("is_public");
    expect(String(policyResult.rows[0].using_expression)).toContain("status");
    expect(String(policyResult.rows[0].using_expression)).toContain("pages.workflow_id");
    expect(String(policyResult.rows[0].check_expression)).toContain("pages.workflow_id");

    const workflowResponse = await request(owner.baseURL)
      .post("/api/workflows")
      .set("Authorization", `Bearer ${owner.authToken}`)
      .send({ title: "SECT-1 vertical proof", projectId: owner.projectId })
      .expect(201);
    const workflowId = workflowResponse.body.id as string;

    const pageResponse = await request(owner.baseURL)
      .post(`/api/workflows/${workflowId}/pages`)
      .set("Authorization", `Bearer ${owner.authToken}`)
      .send({ title: "Identity" })
      .expect(201);
    const pageId = pageResponse.body.id as string;

    await request(owner.baseURL)
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .set("Authorization", `Bearer ${owner.authToken}`)
      .send({ type: "short_text", title: "Legal name", alias: "legalName" })
      .expect(201);

    const pagesResponse = await request(owner.baseURL)
      .get(`/api/workflows/${workflowId}/pages`)
      .set("Authorization", `Bearer ${owner.authToken}`)
      .expect(200);
    expect(pagesResponse.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: pageId, workflowId, title: "Identity" }),
    ]));

    expect(getTableName(schema.pages)).toBe("pages");
    const [physicalRow] = await getOwnerDb()
      .select()
      .from(schema.pages)
      .where(eq(schema.pages.id, pageId));
    expect(physicalRow).toMatchObject({ id: pageId, workflowId, title: "Identity" });

    const publishResponse = await request(owner.baseURL)
      .post(`/api/workflows/${workflowId}/publish`)
      .set("Authorization", `Bearer ${owner.authToken}`)
      .send({ notes: "SECT-1 contract proof" })
      .expect(200);
    const versionId = publishResponse.body.data.id as string;

    const [publishedVersion] = await getOwnerDb()
      .select()
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.id, versionId));
    const graph = publishedVersion.graphJson as Record<string, unknown>;
    expect(graph.pages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: pageId, title: "Identity" }),
    ]));
    expect(graph).not.toHaveProperty("sections");

    const runResponse = await request(owner.baseURL)
      .post(`/api/workflows/${workflowId}/runs`)
      .set("Authorization", `Bearer ${owner.authToken}`)
      .send({})
      .expect(201);
    const { runId, runToken, currentPageId } = runResponse.body.data as {
      runId: string;
      runToken: string;
      currentPageId: string;
    };
    expect(currentPageId).toEqual(expect.any(String));

    const runtimeResponse = await request(owner.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set("Authorization", `Bearer ${runToken}`)
      .expect(200);
    expect(runtimeResponse.body.data.pages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: pageId, workflowId, title: "Identity" }),
    ]));
    expect(runtimeResponse.body.data).not.toHaveProperty("sections");

    const completionResponse = await request(owner.baseURL)
      .put(`/api/runs/${runId}/complete`)
      .set("Authorization", `Bearer ${runToken}`)
      .expect(200);
    expect(completionResponse.body).toMatchObject({ success: true, data: { completed: true } });

    const [completedRun] = await getOwnerDb()
      .select({ currentPageId: schema.workflowRuns.currentPageId, completed: schema.workflowRuns.completed })
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, runId));
    expect(completedRun).toEqual({ currentPageId, completed: true });

    // The new Section data-layer route is distinct from the retired runtime
    // path family and does not reinterpret page ids as Section ids.
    const sectionList = await request(owner.baseURL)
      .get(`/api/workflows/${workflowId}/sections`)
      .set("Authorization", `Bearer ${owner.authToken}`)
      .expect(200);
    expect(sectionList.body).toEqual([]);
    await request(owner.baseURL)
      .put(`/api/sections/${pageId}`)
      .set("Authorization", `Bearer ${owner.authToken}`)
      .send({ title: "Must not update" })
      .expect(404);
    await request(owner.baseURL)
      .post(`/api/runs/${runId}/sections/${pageId}/submit`)
      .set("Authorization", `Bearer ${runToken}`)
      .send({ values: {} })
      .expect(404);
  });

  it("denies tenant A access to tenant B's workflow pages without leaking data", async () => {
    const foreignWorkflow = await request(foreignTenant.baseURL)
      .post("/api/workflows")
      .set("Authorization", `Bearer ${foreignTenant.authToken}`)
      .send({ title: "Foreign workflow", projectId: foreignTenant.projectId })
      .expect(201);

    const denied = await request(owner.baseURL)
      .get(`/api/workflows/${foreignWorkflow.body.id as string}/pages`)
      .set("Authorization", `Bearer ${owner.authToken}`);

    const rlsRestricted = process.env.RLS_RESTRICTED === "true";
    expect(denied.status).toBe(rlsRestricted ? 404 : 403);
    if (!rlsRestricted) {
      expect(denied.body).toEqual({
        message: "Access denied - insufficient permissions for this workflow",
      });
    } else {
      expect(denied.body).toEqual({ message: "Workflow not found" });
    }
    expect(denied.body).not.toHaveProperty("pages");
  });
});
