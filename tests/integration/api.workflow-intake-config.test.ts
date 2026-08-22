import { readFileSync } from "fs";
import { resolve } from "path";

import { eq, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sections, steps, workflows } from "@shared/schema";

import { setupIntegrationTest, type IntegrationTestContext } from "../helpers/integrationTestHelper";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe.sequential("workflow intake configuration contract", () => {
  let ctx: IntegrationTestContext;
  let workflowId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: "Intake Config Contract Tenant",
      createProject: true,
      projectName: "Intake Config Contract Project",
      userRole: "admin",
      tenantRole: "owner",
    });

    const response = await request(ctx.baseURL)
      .post("/api/workflows")
      .set("Authorization", `Bearer ${ctx.authToken}`)
      .send({ title: "Modern Public Workflow", projectId: ctx.projectId })
      .expect(201);

    workflowId = response.body.id as string;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("persists the modern config and preserves it across ordinary workflow updates", async () => {
    const modernConfig = {
      allowPrefill: true,
      allowedPrefillKeys: ["clientName"],
      requireCaptcha: true,
      captchaType: "simple",
      sendEmailReceipt: true,
      receiptEmailVar: "clientEmail",
      receiptTemplateId: "receipt-template",
      excludeFromReceipt: ["ssn"],
    };

    const configResponse = await request(ctx.baseURL)
      .put(`/api/workflows/${workflowId}/intake-config`)
      .set("Authorization", `Bearer ${ctx.authToken}`)
      .send(modernConfig)
      .expect(200);

    expect(configResponse.body.intakeConfig).toEqual(modernConfig);

    const updateResponse = await request(ctx.baseURL)
      .put(`/api/workflows/${workflowId}`)
      .set("Authorization", `Bearer ${ctx.authToken}`)
      .send({ description: "Updated without replacing public-run configuration" })
      .expect(200);

    expect(updateResponse.body.intakeConfig).toEqual(modernConfig);
  });

  it("rejects removed legacy keys through both workflow update routes", async () => {
    const generalResponse = await request(ctx.baseURL)
      .put(`/api/workflows/${workflowId}`)
      .set("Authorization", `Bearer ${ctx.authToken}`)
      .send({ intakeConfig: { isIntake: true } })
      .expect(400);

    expect(generalResponse.body.message).toBe("Invalid input");

    const dedicatedResponse = await request(ctx.baseURL)
      .put(`/api/workflows/${workflowId}/intake-config`)
      .set("Authorization", `Bearer ${ctx.authToken}`)
      .send({ upstreamWorkflowId: workflowId })
      .expect(400);

    expect(dedicatedResponse.body.message).toBe("Invalid input");
  });

  it("removes only legacy persisted values when the cleanup migration runs", async () => {
    const section = await getOwnerDb().query.sections.findFirst({
      where: eq(sections.workflowId, workflowId),
    });
    expect(section).toBeDefined();
    if (!section) {
      throw new Error("Expected the workflow's default section");
    }

    await getOwnerDb().update(workflows)
      .set({
        intakeConfig: {
          allowPrefill: true,
          isIntake: true,
          upstreamWorkflowId: workflowId,
          assignments: [{ targetWorkflowId: workflowId, enabled: true }],
        },
      })
      .where(eq(workflows.id, workflowId));

    await getOwnerDb().update(sections)
      .set({ config: { keep: true, intakeAssignment: true } })
      .where(eq(sections.id, section.id));

    const [legacyStep] = await getOwnerDb().insert(steps).values({
      workflowId,
      sectionId: section.id,
      type: "short_text",
      title: "Legacy intake-linked default",
      order: 99,
      defaultValue: { source: "intake", variable: "clientName" },
    }).returning();

    const migrationPath = resolve(process.cwd(), "migrations", "0006_remove_legacy_intake_reuse.sql");
    const migrationSql = readFileSync(migrationPath, "utf8").replaceAll("--> statement-breakpoint", "");
    // RLS-5: a MIGRATION runs as the schema owner in every real environment, so
    // it must run on the owner connection here too. Through the application
    // pool its UPDATEs are tenant-scoped, match zero rows with no tenant in
    // context, and the cleanup silently does nothing — the assertions below
    // then report stale data as a migration bug.
    await getOwnerDb().execute(sql.raw(migrationSql));

    const cleanedWorkflow = await getOwnerDb().query.workflows.findFirst({
      where: eq(workflows.id, workflowId),
    });
    const cleanedSection = await getOwnerDb().query.sections.findFirst({
      where: eq(sections.id, section.id),
    });
    const cleanedStep = await getOwnerDb().query.steps.findFirst({
      where: eq(steps.id, legacyStep.id),
    });

    expect(cleanedWorkflow?.intakeConfig).toEqual({ allowPrefill: true });
    expect(cleanedSection?.config).toEqual({ keep: true });
    expect(cleanedStep?.defaultValue).toBeNull();
  });
});
