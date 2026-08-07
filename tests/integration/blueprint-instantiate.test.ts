/**
 * ICW2-15 — Template (blueprint) instantiation round-trip + empty-template
 * rejection + project ACL authorization.
 *
 * Covers:
 *   - build -> publish -> create template -> instantiate reproduces the
 *     workflow's sections/steps/logic rules (post-ICW2-6 ingest-shaped
 *     snapshot).
 *   - an empty (`{}`/no-sections) blueprint instantiate returns 400 and
 *     creates nothing.
 *   - a project editor (non-owner) can instantiate into the project; a
 *     viewer cannot.
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import * as schema from "@shared/schema";
import { buildSingleConditionExpression } from "@shared/workflowLogic";
import type { ConditionExpression, Condition } from "@shared/types/conditions";

import { db } from "../../server/db";
import {
  setupIntegrationTest,
  createAuthenticatedAgent,
  createTestUser,
  type IntegrationTestContext,
} from "../helpers/integrationTestHelper";

describe("Blueprint instantiate (ICW2-15)", () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      createProject: true,
      userRole: "admin",
      tenantRole: "owner",
    });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  /** Build a workflow with one section, three steps and a logic rule; return their ids. */
  async function buildWorkflowWithContent(): Promise<{ workflowId: string; sectionId: string }> {
    const wfRes = await agent
      .post("/api/workflows")
      .send({ title: `WF ${nanoid()}`, projectId: ctx.projectId });
    expect(wfRes.status).toBe(201);
    const workflowId = wfRes.body.id as string;

    const secRes = await agent
      .post(`/api/workflows/${workflowId}/sections`)
      .send({ title: "Applicant Info" });
    expect(secRes.status).toBe(201);
    const sectionId = secRes.body.id as string;

    const stepARes = await agent
      .post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`)
      .send({ type: "short_text", title: "First name", alias: "first_name" });
    expect(stepARes.status).toBe(201);

    const stepBRes = await agent
      .post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`)
      .send({ type: "yes_no", title: "Has pets?", alias: "has_pets" });
    expect(stepBRes.status).toBe(201);
    const stepBId = stepBRes.body.id as string;

    const stepCRes = await agent
      .post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`)
      .send({ type: "short_text", title: "Pet name", alias: "pet_name" });
    expect(stepCRes.status).toBe(201);
    const stepCId = stepCRes.body.id as string;

    // Logic rule: show "Pet name" when "Has pets?" equals true. Created
    // directly against the DB — there is no dedicated logic-rule creation
    // route (only AI-ops and GET).
    await db.insert(schema.logicRules).values({
      workflowId,
      conditionStepId: stepBId,
      when: buildSingleConditionExpression(stepBId, "equals", "true"),
      targetType: "step",
      targetStepId: stepCId,
      action: "show",
    });

    return { workflowId, sectionId };
  }

  async function publishAndTemplate(workflowId: string): Promise<string> {
    const pubRes = await agent.post(`/api/workflows/${workflowId}/publish`).send({});
    expect(pubRes.status).toBe(200);

    const tplRes = await agent.post("/api/blueprints").send({
      name: `Template ${nanoid()}`,
      sourceWorkflowId: workflowId,
    });
    expect(tplRes.status).toBe(200);
    return tplRes.body.data.id as string;
  }

  it("reproduces sections/steps/logic rules through build -> publish -> template -> instantiate", async () => {
    const { workflowId } = await buildWorkflowWithContent();
    const templateId = await publishAndTemplate(workflowId);

    const instRes = await agent
      .post(`/api/blueprints/${templateId}/instantiate`)
      .send({ projectId: ctx.projectId });
    expect(instRes.status).toBe(200);
    const newWorkflowId = instRes.body.data.workflowId as string;

    const newWfRes = await agent.get(`/api/workflows/${newWorkflowId}`);
    expect(newWfRes.status).toBe(200);
    // Workflow creation auto-adds a default "Section 1"; the template also
    // carries the explicitly-built "Applicant Info" section.
    expect(newWfRes.body.sections).toHaveLength(2);

    const newSection = newWfRes.body.sections.find((s: any) => s.title === "Applicant Info");
    expect(newSection).toBeDefined();
    expect(newSection.steps).toHaveLength(3);

    const stepsByAlias: Record<string, { id: string; title: string; type: string }> = {};
    for (const step of newSection.steps) {
      stepsByAlias[step.alias as string] = step;
    }
    expect(stepsByAlias.first_name).toMatchObject({ title: "First name", type: "short_text" });
    expect(stepsByAlias.has_pets).toMatchObject({ title: "Has pets?", type: "yes_no" });
    expect(stepsByAlias.pet_name).toMatchObject({ title: "Pet name", type: "short_text" });

    // Logic rule should have been remapped onto the *new* steps, not the
    // original workflow's step ids.
    const newRules = await db
      .select()
      .from(schema.logicRules)
      .where(eq(schema.logicRules.workflowId, newWorkflowId));
    expect(newRules).toHaveLength(1);
    const [rule] = newRules;
    const whenGroup = rule.when as ConditionExpression;
    expect((whenGroup?.conditions[0] as Condition)?.operator).toBe("equals");
    expect(rule.action).toBe("show");
    expect(rule.conditionStepId).toBe(stepsByAlias.has_pets.id);
    expect(rule.targetStepId).toBe(stepsByAlias.pet_name.id);
  });

  it("returns 400 and creates nothing for an empty blueprint", async () => {
    const [blueprint] = await db
      .insert(schema.workflowBlueprints)
      .values({
        tenantId: ctx.tenantId,
        creatorId: ctx.userId,
        name: `Empty ${nanoid()}`,
        graphJson: {},
        isPublic: false,
      })
      .returning();

    const res = await agent.post(`/api/blueprints/${blueprint.id}/instantiate`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no content/i);

    const created = await db
      .select({ id: schema.workflows.id })
      .from(schema.workflows)
      .where(eq(schema.workflows.sourceBlueprintId, blueprint.id));
    expect(created).toHaveLength(0);
  });

  it("allows a project editor (non-owner) to instantiate but blocks a viewer", async () => {
    const { workflowId } = await buildWorkflowWithContent();
    const templateId = await publishAndTemplate(workflowId);

    const editor = await createTestUser(ctx, "viewer");
    const viewer = await createTestUser(ctx, "viewer");

    // ctx's user is the project owner and can grant ACL roles.
    const grantRes = await agent.put(`/api/projects/${ctx.projectId}/access`).send({
      entries: [
        { principalType: "user", principalId: editor.userId, role: "edit" },
        { principalType: "user", principalId: viewer.userId, role: "view" },
      ],
    });
    expect(grantRes.status).toBe(200);

    const editorRes = await request(ctx.baseURL)
      .post(`/api/blueprints/${templateId}/instantiate`)
      .set("Authorization", `Bearer ${editor.token}`)
      .send({ projectId: ctx.projectId });
    expect(editorRes.status).toBe(200);

    const viewerRes = await request(ctx.baseURL)
      .post(`/api/blueprints/${templateId}/instantiate`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ projectId: ctx.projectId });
    expect(viewerRes.status).toBe(403);
  });
});
