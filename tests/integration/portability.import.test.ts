import { randomUUID } from "crypto";
import { type Server } from "http";
import AdmZip from "adm-zip";
import { eq, and } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import * as schema from "@shared/schema";
import { db } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { recomputeChecksum } from "../helpers/bundleTestHelper";

describe.sequential("Portability Import API Integration Tests", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let authToken: string;
  let tenantId: string;
  let userId: string;
  let projectId: string;
  let workflowId: string;
  let bundle: Buffer;

  // A second tenant, for the cross-tenant denial case.
  let otherToken: string;
  let otherTenantId: string;
  let otherProjectId: string;

  async function downloadBundle(scope: string, id: string, token: string): Promise<Buffer> {
    const response = await request(baseURL)
      .get(`/api/portability/export/${scope}/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    return response.body as Buffer;
  }

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    server = await registerRoutes(app);

    const port = await new Promise<number>((resolve) => {
      const testServer = server.listen(0, () => {
        const addr = testServer.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 5022);
      });
    });
    baseURL = `http://localhost:${port}`;

    const [tenant] = await db.insert(schema.tenants).values({
      name: "Test Tenant for Portability Import",
      plan: "free",
    }).returning();
    tenantId = tenant.id;

    const email = `test-import-${nanoid()}@example.com`;
    const registerResponse = await request(baseURL)
      .post("/api/auth/register")
      .send({
        email,
        password: "TestPassword123!@#Strong",
        firstName: "Import",
        lastName: "User",
      })
      .expect(201);
    authToken = registerResponse.body.token;
    userId = registerResponse.body.user.id;

    await db.update(schema.users)
      .set({ tenantId, tenantRole: "owner" })
      .where(eq(schema.users.id, userId));

    // Second tenant + user, entirely separate.
    const [otherTenant] = await db.insert(schema.tenants).values({
      name: "Other Tenant for Portability Import",
      plan: "free",
    }).returning();
    otherTenantId = otherTenant.id;

    const otherEmail = `test-import-other-${nanoid()}@example.com`;
    const otherRegister = await request(baseURL)
      .post("/api/auth/register")
      .send({
        email: otherEmail,
        password: "TestPassword123!@#Strong",
        firstName: "Other",
        lastName: "User",
      })
      .expect(201);
    otherToken = otherRegister.body.token;

    await db.update(schema.users)
      .set({ tenantId: otherTenantId, tenantRole: "owner" })
      .where(eq(schema.users.id, otherRegister.body.user.id));

    const otherProject = await request(baseURL)
      .post("/api/projects")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ name: `Other Project ${nanoid()}` })
      .expect(201);
    otherProjectId = otherProject.body.id;
  });

  afterAll(async () => {
    for (const id of [tenantId, otherTenantId]) {
      if (id) {
        await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
      }
    }
    if (server) {
      await new Promise<void>((resolve) => { server.close(() => resolve()); });
    }
  });

  beforeEach(async () => {
    const projectResponse = await request(baseURL)
      .post("/api/projects")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: `Import Project ${nanoid()}` })
      .expect(201);
    projectId = projectResponse.body.id;

    // Give the project a workflow with real contents, so the round-trip is
    // asserting structure rather than an empty shell.
    const [workflow] = await db.insert(schema.workflows).values({
      title: `Import Workflow ${nanoid()}`,
      name: `Import Workflow`,
      projectId,
      creatorId: userId,
      ownerId: userId,
      ownerType: 'user',
      ownerUuid: userId,
    }).returning();
    workflowId = workflow.id;

    const [section] = await db.insert(schema.sections).values({
      workflowId,
      title: "Page One",
      order: 0,
    }).returning();

    await db.insert(schema.steps).values({
      workflowId,
      sectionId: section.id,
      type: 'text',
      title: 'Your name',
      alias: 'your_name',
      order: 0,
    });

    bundle = await downloadBundle("project", projectId, authToken);

    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.userId, userId));
  });

  it("AC 1: preview returns the ImportPreview JSON and writes nothing", async () => {
    const projectsBefore = await db.select().from(schema.projects);
    const workflowsBefore = await db.select().from(schema.workflows);

    const response = await request(baseURL)
      .post("/api/portability/import/preview")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", bundle, "bundle.ezb")
      .expect(200);

    expect(response.body).toHaveProperty("entityCounts");
    expect(response.body).toHaveProperty("collisions");
    expect(response.body).toHaveProperty("canProceed");
    expect(response.body.entityCounts.workflows).toBeGreaterThan(0);

    const projectsAfter = await db.select().from(schema.projects);
    const workflowsAfter = await db.select().from(schema.workflows);
    expect(projectsAfter.length).toBe(projectsBefore.length);
    expect(workflowsAfter.length).toBe(workflowsBefore.length);

    // AC 6: previews are not audit-logged.
    const logs = await db.select().from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.userId, userId), eq(schema.auditLogs.action, "data_imported")));
    expect(logs).toHaveLength(0);
  });

  it("AC 2 & 6: apply creates the objects, returns the root id, and logs exactly one audit row", async () => {
    const response = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", bundle, "bundle.ezb")
      .expect(201);

    const newRootId = response.body.rootId;
    expect(newRootId).toBeTruthy();
    expect(newRootId).not.toBe(projectId);

    // The imported project really carries the workflow's contents (IEX-13).
    const [importedWorkflow] = await db.select().from(schema.workflows)
      .where(eq(schema.workflows.projectId, newRootId));
    expect(importedWorkflow).toBeDefined();
    expect(importedWorkflow.id).not.toBe(workflowId);

    const importedSteps = await db.select().from(schema.steps)
      .where(eq(schema.steps.workflowId, importedWorkflow.id));
    expect(importedSteps).toHaveLength(1);
    expect(importedSteps[0].alias).toBeTruthy();

    const logs = await db.select().from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.userId, userId), eq(schema.auditLogs.action, "data_imported")));
    expect(logs).toHaveLength(1);
    expect(logs[0].entityId).toBe(newRootId);
    const changes = logs[0].changes as Record<string, unknown>;
    expect(changes["scope"]).toBe("project");
    expect(changes["entityCounts"]).toBeDefined();
  });

  it("AC 3: unauthenticated requests are rejected with 401", async () => {
    await request(baseURL)
      .post("/api/portability/import/preview")
      .attach("file", bundle, "bundle.ezb")
      .expect(401);

    await request(baseURL)
      .post("/api/portability/import/apply")
      .attach("file", bundle, "bundle.ezb")
      .expect(401);
  });

  it("AC 3: importing into another tenant's project is denied", async () => {
    const response = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .field("targetProjectId", otherProjectId)
      .attach("file", bundle, "bundle.ezb");

    expect([403, 404]).toContain(response.status);

    // Nothing was written into the other tenant.
    const otherWorkflows = await db.select().from(schema.workflows)
      .where(eq(schema.workflows.projectId, otherProjectId));
    expect(otherWorkflows).toHaveLength(0);
  });

  it("AC 4: a corrupt, non-zip upload is a 400 and never a 500", async () => {
    const garbage = Buffer.from("this is definitely not a zip archive");

    const preview = await request(baseURL)
      .post("/api/portability/import/preview")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", garbage, "broken.ezb");
    expect(preview.status).toBe(400);
    expect(preview.status).not.toBe(500);
    expect(preview.body.message).toBeTruthy();

    const apply = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", garbage, "broken.ezb");
    expect(apply.status).toBe(400);
    expect(apply.status).not.toBe(500);
  });

  it("AC 4: a request with no file attached is a 400", async () => {
    const response = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/required/i);
  });

  it("IEX2-2 AC 3: an unresolvable NOT NULL reference is a 400, not a 500", async () => {
    // `steps.sectionId` is NOT NULL, so an unresolvable value cannot be dropped
    // and the import must be rejected. The classification is substring matching
    // on the thrown message (BUNDLE_REJECTION_SIGNALS), so it is only one
    // rename away from silently reverting to a 500 — hence a route-level test
    // rather than trusting the signal list by inspection.
    const zip = new AdmZip(bundle);
    const stepsLines = zip.getEntry("entities/steps.jsonl")!.getData()
      .toString("utf8").split(/\r?\n/).filter(Boolean);
    const firstStep = JSON.parse(stepsLines[0]);
    stepsLines.push(JSON.stringify({
      ...firstStep,
      id: randomUUID(),
      title: "Orphan Step",
      alias: `orphan_${nanoid(6)}`,
      sectionId: randomUUID(), // a section that is not in the bundle
      order: 99,
    }));
    zip.updateFile("entities/steps.jsonl", Buffer.from(`${stepsLines.join("\n")}\n`));

    const manifest = JSON.parse(zip.getEntry("manifest.json")!.getData().toString("utf8"));
    manifest.entityCounts.steps = (manifest.entityCounts.steps ?? 0) + 1;
    recomputeChecksum(zip, manifest);
    zip.updateFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
    const tampered = zip.toBuffer();

    const apply = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", tampered, "bundle.ezb");

    expect(apply.status).toBe(400);
    expect(apply.status).not.toBe(500);
    expect(apply.body.message).toMatch(/Unresolvable reference/);
    expect(apply.body.message).toMatch(/steps\.sectionId/);

    // Preview refuses the same bundle up front rather than only at apply.
    const preview = await request(baseURL)
      .post("/api/portability/import/preview")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", tampered, "bundle.ezb")
      .expect(200);
    expect(preview.body.canProceed).toBe(false);
    expect(preview.body.errors.some((e: string) => e.includes("Unresolvable reference"))).toBe(true);
  });
});
