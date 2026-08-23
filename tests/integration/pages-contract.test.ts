/**
 * SECT-1 vertical contract proof.
 *
 * Exercises the real HTTP → service → repository → pinned physical table hop,
 * then the real publish → graph_json → run runtime hop. No repository, DB, or
 * runtime provider is mocked in this file.
 */
import { eq, getTableName, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@shared/schema";

import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from "../helpers/integrationTestHelper";
import { getOwnerDb } from "../helpers/ownerDb";

describe.sequential("SECT-1 pages API and published runtime contract", () => {
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

  it("loads pages from the pinned table, publishes graph_json.pages, and serves them to a run", async () => {
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
          (table_name = 'sections' AND column_name = 'id')
          OR (table_name = 'steps' AND column_name = 'section_id')
          OR (table_name = 'blocks' AND column_name = 'section_id')
          OR (table_name = 'lifecycle_hooks' AND column_name = 'section_id')
          OR (table_name = 'logic_rules' AND column_name = 'target_section_id')
          OR (table_name = 'transform_blocks' AND column_name IN ('section_id', 'phase'))
          OR (table_name = 'workflow_runs' AND column_name = 'current_section_id')
        )
      ORDER BY table_name, column_name
    `);
    expect(catalogResult.rows).toEqual([
      { table_name: "blocks", column_name: "section_id", column_default: null },
      { table_name: "lifecycle_hooks", column_name: "section_id", column_default: null },
      { table_name: "logic_rules", column_name: "target_section_id", column_default: null },
      { table_name: "sections", column_name: "id", column_default: "gen_random_uuid()" },
      { table_name: "steps", column_name: "section_id", column_default: null },
      { table_name: "transform_blocks", column_name: "phase", column_default: "'onPageSubmit'::block_phase" },
      { table_name: "transform_blocks", column_name: "section_id", column_default: null },
      { table_name: "workflow_runs", column_name: "current_section_id", column_default: null },
    ]);

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

    // Drizzle's public symbol is `pages`, while this ticket deliberately keeps
    // the physical relation pinned until SECT-2.
    expect(getTableName(schema.pages)).toBe("sections");
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
    const { runId, runToken } = runResponse.body.data as { runId: string; runToken: string };

    const runtimeResponse = await request(owner.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set("Authorization", `Bearer ${runToken}`)
      .expect(200);
    expect(runtimeResponse.body.data.pages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: pageId, workflowId, title: "Identity" }),
    ]));
    expect(runtimeResponse.body.data).not.toHaveProperty("sections");

    // There is no compatibility route for any old path family.
    await request(owner.baseURL)
      .get(`/api/workflows/${workflowId}/sections`)
      .set("Authorization", `Bearer ${owner.authToken}`)
      .expect(404);
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

  it("preserves the 403 contract when tenant A requests tenant B's workflow pages", async () => {
    const foreignWorkflow = await request(foreignTenant.baseURL)
      .post("/api/workflows")
      .set("Authorization", `Bearer ${foreignTenant.authToken}`)
      .send({ title: "Foreign workflow", projectId: foreignTenant.projectId })
      .expect(201);

    const denied = await request(owner.baseURL)
      .get(`/api/workflows/${foreignWorkflow.body.id as string}/pages`)
      .set("Authorization", `Bearer ${owner.authToken}`)
      .expect(403);
    expect(denied.body).toEqual({
      message: "Access denied - insufficient permissions for this workflow",
    });
    expect(denied.body).not.toHaveProperty("pages");
  });
});
