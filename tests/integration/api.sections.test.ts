import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@shared/schema";

import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from "../helpers/integrationTestHelper";
import { getOwnerDb } from "../helpers/ownerDb";

let owner: IntegrationTestContext;
let foreign: IntegrationTestContext;
let agent: ReturnType<typeof createAuthenticatedAgent>;
let foreignAgent: ReturnType<typeof createAuthenticatedAgent>;

const migrationNames = readdirSync(join(process.cwd(), "migrations"))
  .filter((name) => name.startsWith("0039_") && name.endsWith(".sql"));
const migrationSql = migrationNames.length === 1
  ? readFileSync(join(process.cwd(), "migrations", migrationNames[0]), "utf8")
  : "";

beforeAll(async () => {
  owner = await setupIntegrationTest({
    tenantName: "SECT-3 owner",
    createProject: true,
    projectName: "SECT-3 owner project",
  });
  foreign = await setupIntegrationTest({
    tenantName: "SECT-3 foreign",
    createProject: true,
    projectName: "SECT-3 foreign project",
  });
  agent = createAuthenticatedAgent(owner.baseURL, owner.authToken);
  foreignAgent = createAuthenticatedAgent(foreign.baseURL, foreign.authToken);
});

afterAll(async () => {
  await foreign.cleanup();
  await owner.cleanup();
});

async function createWorkflowWithPages(
  api: ReturnType<typeof createAuthenticatedAgent>,
  context: IntegrationTestContext,
  titles: string[],
): Promise<{ workflowId: string; pageIds: string[] }> {
  const workflowResponse = await api
    .post("/api/workflows")
    .send({ title: `SECT-3 ${nanoid()}`, projectId: context.projectId });
  expect(workflowResponse.status).toBe(201);
  const workflowId = workflowResponse.body.id as string;
  const initialPages = await api.get(`/api/workflows/${workflowId}/pages`);
  expect(initialPages.status).toBe(200);
  expect(initialPages.body).toHaveLength(1);
  const firstPageId = initialPages.body[0].id as string;
  const renamed = await api.put(`/api/pages/${firstPageId}`).send({ title: titles[0] });
  expect(renamed.status).toBe(200);
  expect(renamed.body.sectionId).toBeNull();
  const pageIds: string[] = [firstPageId];
  for (const title of titles.slice(1)) {
    const pageResponse = await api
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title });
    expect(pageResponse.status).toBe(201);
    expect(pageResponse.body.sectionId).toBeNull();
    pageIds.push(pageResponse.body.id as string);
  }
  return { workflowId, pageIds };
}

async function pageRows(workflowId: string): Promise<Array<{
  id: string;
  order: number;
  sectionId: string | null;
  deletedAt: Date | null;
}>> {
  return getOwnerDb()
    .select({
      id: schema.pages.id,
      order: schema.pages.order,
      sectionId: schema.pages.sectionId,
      deletedAt: schema.pages.deletedAt,
    })
    .from(schema.pages)
    .where(eq(schema.pages.workflowId, workflowId))
    .orderBy(schema.pages.order);
}

describe.sequential("SECT-3 Sections API and contiguous membership", () => {
  it("keeps generated 0039 metadata aligned and exposes the required catalog/RLS shape", async () => {
    expect(migrationNames).toHaveLength(1);
    expect(migrationSql).toContain('CREATE TABLE "sections"');
    expect(migrationSql).toContain('ALTER TABLE "pages" ADD COLUMN "section_id" uuid');
    expect(migrationSql).toContain("ON DELETE set null");
    expect(migrationSql).toContain('CREATE POLICY tenant_isolation ON "sections"');
    expect(migrationSql).not.toMatch(/"sections"[\s\S]*"order"/i);

    const columns = await getOwnerDb()
      .select()
      .from(schema.sections)
      .limit(0);
    expect(columns).toEqual([]);

    const catalog = await getOwnerDb().execute(sql.raw(`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'sections' AND column_name = 'order'
        ) AS has_section_order,
        (
          SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'pages' AND column_name = 'section_id'
        ) AS page_section_nullable,
        EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = current_schema() AND indexname = 'sections_workflow_idx'
        ) AS has_workflow_index,
        EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_policy p ON p.polrelid = c.oid AND p.polname = 'tenant_isolation'
          WHERE n.nspname = current_schema() AND c.relname = 'sections' AND c.relrowsecurity
        ) AS has_rls_policy,
        (
          SELECT c.confdeltype FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = current_schema()
            AND c.conname = 'pages_section_id_sections_id_fk'
        ) AS delete_action
    `));
    expect(catalog.rows).toEqual([{
      has_section_order: false,
      page_section_nullable: "YES",
      has_workflow_index: true,
      has_rls_policy: true,
      delete_action: "n",
    }]);
  });

  it("runs the real create → reorder → list → delete vertical path", async () => {
    const { workflowId, pageIds } = await createWorkflowWithPages(
      agent,
      owner,
      ["Identity", "Address", "Welcome"],
    );

    const create = await agent
      .post(`/api/workflows/${workflowId}/sections`)
      .send({ title: "Applicant", pageIds: [pageIds[0]] });
    expect(create.status).toBe(201);
    const sectionId = create.body.id as string;

    const reorder = await agent
      .put(`/api/workflows/${workflowId}/pages/reorder`)
      .send({
        pages: pageIds.map((id, order) => ({ id, order, sectionId })),
        deleteEmptySectionIds: [],
      });
    expect(reorder.status).toBe(200);

    const listedPages = await agent.get(`/api/workflows/${workflowId}/pages`);
    expect(listedPages.status).toBe(200);
    expect(listedPages.body.map((page: { sectionId: string | null }) => page.sectionId))
      .toEqual([sectionId, sectionId, sectionId]);
    const listedSections = await agent.get(`/api/workflows/${workflowId}/sections`);
    expect(listedSections.status).toBe(200);
    expect(listedSections.body).toEqual([
      expect.objectContaining({ id: sectionId, title: "Applicant" }),
    ]);

    const beforeDelete = await pageRows(workflowId);
    const deleted = await agent.delete(`/api/sections/${sectionId}`);
    expect(deleted.status).toBe(204);
    const afterDelete = await pageRows(workflowId);
    expect(afterDelete.map((page) => page.sectionId)).toEqual([null, null, null]);
    expect(afterDelete.map((page) => page.order)).toEqual(
      beforeDelete.map((page) => page.order),
    );
  });

  it("serializes concurrent Section creation on the workflow mutex", async () => {
    const { workflowId, pageIds } = await createWorkflowWithPages(
      agent,
      owner,
      ["Contended page"],
    );

    const responses = await Promise.all(
      ["First contender", "Second contender"].map((title) =>
        agent
          .post(`/api/workflows/${workflowId}/sections`)
          .send({ title, pageIds }),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([201, 400]);
    expect(responses.find((response) => response.status === 400)?.body.message)
      .toMatch(/Section ".+" cannot be empty/);

    const persistedSections = await getOwnerDb()
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(eq(schema.sections.workflowId, workflowId));
    expect(persistedSections).toHaveLength(1);
    expect((await pageRows(workflowId))[0].sectionId).toBe(persistedSections[0].id);
  });

  it("rejects empty, foreign, duplicate, and non-contiguous creation atomically", async () => {
    const mine = await createWorkflowWithPages(agent, owner, ["A", "B", "C"]);
    const otherMine = await createWorkflowWithPages(agent, owner, ["Other workflow"]);

    const empty = await agent
      .post(`/api/workflows/${mine.workflowId}/sections`)
      .send({ title: "Empty", pageIds: [] });
    expect(empty.status).toBe(400);

    const duplicate = await agent
      .post(`/api/workflows/${mine.workflowId}/sections`)
      .send({ title: "Duplicate", pageIds: [mine.pageIds[0], mine.pageIds[0]] });
    expect(duplicate.status).toBe(400);

    const crossWorkflow = await agent
      .post(`/api/workflows/${mine.workflowId}/sections`)
      .send({ title: "Foreign page", pageIds: [otherMine.pageIds[0]] });
    expect(crossWorkflow.status).toBe(404);

    const split = await agent
      .post(`/api/workflows/${mine.workflowId}/sections`)
      .send({ title: "Split Section", pageIds: [mine.pageIds[0], mine.pageIds[2]] });
    expect(split.status).toBe(400);
    expect(split.body.message).toContain("Split Section");

    const written = await getOwnerDb()
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.workflowId, mine.workflowId));
    expect(written).toEqual([]);
    expect((await pageRows(mine.workflowId)).map((page) => page.sectionId))
      .toEqual([null, null, null]);
  });

  it("denies cross-tenant Section creation with 404 and writes no row", async () => {
    const theirs = await createWorkflowWithPages(foreignAgent, foreign, ["Foreign page"]);
    const response = await agent
      .post(`/api/workflows/${theirs.workflowId}/sections`)
      .send({ title: "Sneaky", pageIds: [theirs.pageIds[0]] });
    expect(response.status).toBe(404);
    const rows = await getOwnerDb()
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.workflowId, theirs.workflowId));
    expect(rows).toEqual([]);
  });

  it("preserves 403 for a same-tenant user without edit access", async () => {
    const mine = await createWorkflowWithPages(agent, owner, ["Owner page"]);
    const viewer = await createTestUser(owner, "viewer");
    const viewerAgent = createAuthenticatedAgent(owner.baseURL, viewer.token);

    const response = await viewerAgent
      .post(`/api/workflows/${mine.workflowId}/sections`)
      .send({ title: "Not allowed", pageIds: [mine.pageIds[0]] });

    expect(response.status).toBe(403);
    const rows = await getOwnerDb()
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.workflowId, mine.workflowId));
    expect(rows).toEqual([]);
  });

  it("rejects a split reorder with 400 and rolls every row back", async () => {
    const { workflowId, pageIds } = await createWorkflowWithPages(agent, owner, ["A", "B", "C"]);
    const create = await agent
      .post(`/api/workflows/${workflowId}/sections`)
      .send({ title: "Contiguous Group", pageIds: pageIds.slice(0, 2) });
    expect(create.status).toBe(201);
    const sectionId = create.body.id as string;
    const before = await pageRows(workflowId);

    const response = await agent
      .put(`/api/workflows/${workflowId}/pages/reorder`)
      .send({
        pages: [
          { id: pageIds[0], order: 0, sectionId },
          { id: pageIds[1], order: 1, sectionId: null },
          { id: pageIds[2], order: 2, sectionId },
        ],
        deleteEmptySectionIds: [],
      });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Contiguous Group");
    expect(await pageRows(workflowId)).toEqual(before);
  });

  it("requires exact deletion authorization and commits a confirmed empty deletion atomically", async () => {
    const { workflowId, pageIds } = await createWorkflowWithPages(agent, owner, ["Only page"]);
    const create = await agent
      .post(`/api/workflows/${workflowId}/sections`)
      .send({ title: "One Page Section", pageIds });
    const sectionId = create.body.id as string;

    const unchangedLayout = [{ id: pageIds[0], order: 0, sectionId }];
    const stale = await agent
      .put(`/api/workflows/${workflowId}/pages/reorder`)
      .send({ pages: unchangedLayout, deleteEmptySectionIds: [sectionId] });
    expect(stale.status).toBe(409);
    expect(stale.body.message).toContain("One Page Section");

    const ungroupedLayout = [{ id: pageIds[0], order: 0, sectionId: null }];
    const refused = await agent
      .put(`/api/workflows/${workflowId}/pages/reorder`)
      .send({ pages: ungroupedLayout, deleteEmptySectionIds: [] });
    expect(refused.status).toBe(409);
    expect(refused.body.message).toContain("One Page Section");
    expect((await pageRows(workflowId))[0].sectionId).toBe(sectionId);

    const confirmed = await agent
      .put(`/api/workflows/${workflowId}/pages/reorder`)
      .send({ pages: ungroupedLayout, deleteEmptySectionIds: [sectionId] });
    expect(confirmed.status).toBe(200);
    expect((await pageRows(workflowId))[0]).toMatchObject({ order: 0, sectionId: null });
    const [remaining] = await getOwnerDb()
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.id, sectionId));
    expect(remaining).toBeUndefined();
  });

  it("rejects incomplete/implicit layouts and generic membership mutation", async () => {
    const { workflowId, pageIds } = await createWorkflowWithPages(agent, owner, ["A", "B"]);
    const create = await agent
      .post(`/api/workflows/${workflowId}/sections`)
      .send({ title: "Locked Membership", pageIds: [pageIds[0]] });
    const sectionId = create.body.id as string;

    const omittedMembership = await agent
      .put(`/api/workflows/${workflowId}/pages/reorder`)
      .send({ pages: pageIds.map((id, order) => ({ id, order })) });
    expect(omittedMembership.status).toBe(400);

    const incomplete = await agent
      .put(`/api/workflows/${workflowId}/pages/reorder`)
      .send({ pages: [{ id: pageIds[0], order: 0, sectionId }] });
    expect(incomplete.status).toBe(400);

    const genericCreate = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: "Injected", sectionId });
    expect(genericCreate.status).toBe(201);
    expect(genericCreate.body.sectionId).toBeNull();

    const genericUpdate = await agent
      .put(`/api/pages/${pageIds[1]}`)
      .send({ sectionId });
    expect(genericUpdate.status).toBe(200);
    expect(genericUpdate.body.sectionId).toBeNull();
    expect((await pageRows(workflowId)).map((page) => page.sectionId))
      .toEqual([sectionId, null, null]);
  });

  it("rolls back page and step soft-delete when it would empty a named Section", async () => {
    const { workflowId, pageIds } = await createWorkflowWithPages(agent, owner, ["Protected"]);
    const sectionResponse = await agent
      .post(`/api/workflows/${workflowId}/sections`)
      .send({ title: "Cannot Empty", pageIds });
    const sectionId = sectionResponse.body.id as string;
    const stepResponse = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageIds[0]}/steps`)
      .send({ type: "short_text", title: "Answer me" });
    expect(stepResponse.status).toBe(201);

    const deleted = await agent.delete(`/api/pages/${pageIds[0]}`);
    expect(deleted.status).toBe(409);
    expect(deleted.body.message).toContain("Cannot Empty");

    const [page] = await getOwnerDb()
      .select()
      .from(schema.pages)
      .where(eq(schema.pages.id, pageIds[0]));
    expect(page).toMatchObject({ sectionId, deletedAt: null });
    const [step] = await getOwnerDb()
      .select()
      .from(schema.steps)
      .where(and(
        eq(schema.steps.id, stepResponse.body.id as string),
        eq(schema.steps.pageId, pageIds[0]),
      ));
    expect(step.deletedAt).toBeNull();
  });

  it("keeps restore atomic when an old membership would split the active Section span", async () => {
    const { workflowId, pageIds } = await createWorkflowWithPages(agent, owner, ["A", "B", "C", "D"]);
    const initialOrder = await agent
      .put(`/api/workflows/${workflowId}/pages/reorder`)
      .send({
        pages: pageIds.map((id, order) => ({ id, order, sectionId: null })),
        deleteEmptySectionIds: [],
      });
    expect(initialOrder.status).toBe(200);
    const sectionResponse = await agent
      .post(`/api/workflows/${workflowId}/sections`)
      .send({ title: "Restore Guard", pageIds: pageIds.slice(0, 3) });
    const sectionId = sectionResponse.body.id as string;

    const deleted = await agent.delete(`/api/pages/${pageIds[1]}`);
    expect(deleted.status).toBe(204);
    const activeReorder = await agent
      .put(`/api/workflows/${workflowId}/pages/reorder`)
      .send({
        pages: [
          { id: pageIds[3], order: 2, sectionId: null },
          { id: pageIds[0], order: 3, sectionId },
          { id: pageIds[2], order: 4, sectionId },
        ],
        deleteEmptySectionIds: [],
      });
    expect(activeReorder.status).toBe(200);

    const restored = await agent.post(`/api/pages/${pageIds[1]}/restore`);
    expect(restored.status).toBe(400);
    expect(restored.body.message).toContain("Restore Guard");
    const [persisted] = await getOwnerDb()
      .select()
      .from(schema.pages)
      .where(eq(schema.pages.id, pageIds[1]));
    expect(persisted.deletedAt).not.toBeNull();
    expect(persisted.sectionId).toBe(sectionId);
  });
});
