import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupIntegrationTest, type IntegrationTestContext } from "../helpers/integrationTestHelper";
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

  it("removes only legacy persisted values when 0006 runs in its pre-rename schema", async () => {
    const fixtureSchema = `intake_0006_${randomUUID().replaceAll("-", "")}`;
    const migrationSql = readFileSync(
      resolve(process.cwd(), "migrations", "0006_remove_legacy_intake_reuse.sql"),
      "utf8",
    );
    const ownerDb = getOwnerDb();
    await ownerDb.execute(sql.raw(`CREATE SCHEMA "${fixtureSchema}"`));
    try {
      await ownerDb.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL search_path TO "${fixtureSchema}", public`));
        await tx.execute(sql.raw(`
          CREATE TABLE workflows (id integer PRIMARY KEY, intake_config jsonb);
          CREATE TABLE sections (id integer PRIMARY KEY, config jsonb);
          CREATE TABLE steps (id integer PRIMARY KEY, default_value jsonb);
          INSERT INTO workflows VALUES
            (1, '{"allowPrefill":true,"isIntake":true,"upstreamWorkflowId":"wf","assignments":[{"enabled":true}]}'),
            (2, '{"allowPrefill":false,"custom":"keep"}');
          INSERT INTO sections VALUES
            (1, '{"keep":true,"intakeAssignment":true}'),
            (2, '{"keep":true}');
          INSERT INTO steps VALUES
            (1, '{"source":"intake","variable":"clientName"}'),
            (2, '"static default"');
        `));
        await tx.execute(sql.raw(migrationSql));

        const workflows = await tx.execute(sql.raw("SELECT id, intake_config FROM workflows ORDER BY id"));
        const pages = await tx.execute(sql.raw("SELECT id, config FROM sections ORDER BY id"));
        const steps = await tx.execute(sql.raw("SELECT id, default_value FROM steps ORDER BY id"));
        expect(workflows.rows).toEqual([
          { id: 1, intake_config: { allowPrefill: true } },
          { id: 2, intake_config: { allowPrefill: false, custom: "keep" } },
        ]);
        expect(pages.rows).toEqual([
          { id: 1, config: { keep: true } },
          { id: 2, config: { keep: true } },
        ]);
        expect(steps.rows).toEqual([
          { id: 1, default_value: null },
          { id: 2, default_value: "static default" },
        ]);
      });
    } finally {
      await ownerDb.execute(sql.raw(`DROP SCHEMA IF EXISTS "${fixtureSchema}" CASCADE`));
    }
  });
});
