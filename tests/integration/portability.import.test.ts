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
import {
  recomputeChecksum, seedWorkflow, seedTemplate, seedDatavault
} from "../helpers/bundleTestHelper";

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

  it("IEX3-8 & IEX3-9: the rename field is honoured and adjustments come back over HTTP", async () => {
    // Both halves were dead end-to-end: `name` was allowlisted by the route and
    // never read by the service, and `adjustments` was composed by the service
    // and never returned by the route. Asserted here rather than only at the
    // service layer, because the gap was in the wiring both times.
    const response = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .field("name", "Renamed On Import")
      .attach("file", bundle, "bundle.ezb")
      .expect(201);

    const [importedProject] = await db.select().from(schema.projects)
      .where(eq(schema.projects.id, response.body.rootId));
    expect(importedProject.title).toBe("Renamed On Import");

    // Present and empty here — this bundle's project travelled with it, so
    // nothing had to be decided. The field existing is the contract.
    expect(response.body.adjustments).toEqual([]);
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

  it("IEX2-5 AC 1 & 2: returned and audited entity counts are observed counts, not manifest claims", async () => {
    const zip = new AdmZip(bundle);
    const manifest = JSON.parse(zip.getEntry("manifest.json")!.getData().toString("utf8"));
    
    // Store original counts to verify actual inserted matches these, not the forged ones
    const originalWorkflowCount = manifest.entityCounts.workflows || 0;
    const originalStepCount = manifest.entityCounts.steps || 0;
    
    // Tamper with the counts in the manifest
    manifest.entityCounts.workflows = 9999;
    manifest.entityCounts.steps = 9999;
    manifest.entityCounts.fake_entity = 50;
    
    recomputeChecksum(zip, manifest);
    zip.updateFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
    const tampered = zip.toBuffer();

    const apply = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", tampered, "bundle.ezb")
      .expect(201);

    // AC 1: Returned counts reflect actual inserted rows
    expect(apply.body.entityCounts.workflows).toBe(originalWorkflowCount);
    expect(apply.body.entityCounts.workflows).not.toBe(9999);
    expect(apply.body.entityCounts.steps).toBe(originalStepCount);
    expect(apply.body.entityCounts.fake_entity).toBeUndefined();

    // AC 2: Audit row carries observed counts
    const logs = await db.select().from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.userId, userId), eq(schema.auditLogs.action, "data_imported")));
    expect(logs.length).toBeGreaterThan(0);
    
    // Get the most recent log
    const lastLog = logs[logs.length - 1];
    const changes = lastLog.changes as Record<string, unknown>;
    const auditedCounts = changes.entityCounts as Record<string, number>;
    
    expect(auditedCounts.workflows).toBe(originalWorkflowCount);
    expect(auditedCounts.workflows).not.toBe(9999);
  });

  it("IEX2-5 AC 3: a bundle whose rootIds match nothing is rejected with 400", async () => {
    const zip = new AdmZip(bundle);
    const manifest = JSON.parse(zip.getEntry("manifest.json")!.getData().toString("utf8"));
    
    // Tamper with the rootIds so they match nothing
    manifest.rootIds = [randomUUID(), randomUUID()];
    
    recomputeChecksum(zip, manifest);
    zip.updateFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
    const tampered = zip.toBuffer();

    const workflowsBefore = await db.select().from(schema.workflows);

    const apply = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", tampered, "bundle.ezb");

    expect(apply.status).toBe(400);
    expect(apply.body.message).toMatch(/Bundle roots not found/);

    // Does not return 201 with an empty rootId
    expect(apply.body.rootId).toBeUndefined();

    // The rejection must roll back Pass 2, not merely report a 400 after it
    // committed — otherwise the import leaves orphaned rows no rootId can reach.
    const workflowsAfter = await db.select().from(schema.workflows);
    expect(workflowsAfter.length).toBe(workflowsBefore.length);
  });

  it("IEX2-12 AC 2: duplicate entries in the zip are a 400, not a 500", async () => {
    const zip = new AdmZip();
    zip.addFile("manifest.json", Buffer.from(JSON.stringify({
      formatVersion: 1, appVersion: '1.0', migrationHead: '0001',
      scope: 'project', rootIds: ['a'], sourceSystem: 'x', createdAt: '2024-01-01T00:00:00.000Z',
      entityCounts: {}, blobCount: 0, checksum: 'a'.repeat(64)
    })));
    // We want a duplicate entry. adm-zip replaces files with the same name.
    // So we add 'fileA' and 'fileB', then rename 'fileB' to 'fileA' in the raw buffer.
    zip.addFile("entities/fileA.jsonl", Buffer.from("A"));
    zip.addFile("entities/fileB.jsonl", Buffer.from("B"));
    
    let buffer = zip.toBuffer();
    
    // Replace all occurrences of "fileB.jsonl" with "fileA.jsonl" in the buffer
    let str = buffer.toString('binary');
    str = str.replace(/fileB\.jsonl/g, "fileA.jsonl");
    buffer = Buffer.from(str, 'binary');

    const apply = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", buffer, "bundle.ezb");

    expect(apply.status).toBe(400);
    expect(apply.body.message).toMatch(/Duplicate entry detected/);
  });

  it("IEX2-13 AC 4: size mismatch in the zip is a 400, not a 500", async () => {
    const zip = new AdmZip();
    zip.addFile("manifest.json", Buffer.from(JSON.stringify({
      formatVersion: 1, appVersion: '1.0', migrationHead: '0001',
      scope: 'project', rootIds: ['a'], sourceSystem: 'x', createdAt: '2024-01-01T00:00:00.000Z',
      entityCounts: {}, blobCount: 0, checksum: 'a'.repeat(64)
    })));
    zip.addFile("entities/test.jsonl", Buffer.from("1234567890"));
    
    const buffer = zip.toBuffer();
    
    // Modify central directory header uncompressed size.
    // Central directory signature is 0x02014b50 (PK\x01\x02)
    let offset = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    // Find the one for test.jsonl
    while (offset !== -1) {
      const fileNameLen = buffer.readUInt16LE(offset + 28);
      const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLen);
      if (fileName === "entities/test.jsonl") {
        buffer.writeUInt32LE(99, offset + 24); // uncompressed size
        break;
      }
      offset = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset + 4);
    }
    
    const apply = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", buffer, "bundle.ezb");

    expect(apply.status).toBe(400);
    expect(apply.body.message).toMatch(/Size mismatch/);
  });

  describe("IEX3-1: a workflow-scope bundle round-trips", () => {
    async function exportWorkflowBundle(workflowId: string): Promise<Buffer> {
      return downloadBundle("workflow", workflowId, authToken);
    }

    it("AC 2: a workflow with a document template previews clean and applies 201", async () => {
      const { workflowId } = await seedWorkflow({ projectId, userId });
      await seedTemplate({ projectId, userId, attachToWorkflowId: workflowId });

      const wfBundle = await exportWorkflowBundle(workflowId);

      const preview = await request(baseURL)
        .post("/api/portability/import/preview")
        .set("Authorization", `Bearer ${authToken}`)
        .attach("file", wfBundle, "wf.ezb")
        .expect(200);

      expect(preview.body.errors).toEqual([]);
      expect(preview.body.canProceed).toBe(true);
      expect(preview.body.entityCounts.templates).toBe(1);

      const applied = await request(baseURL)
        .post("/api/portability/import/apply")
        .set("Authorization", `Bearer ${authToken}`)
        .attach("file", wfBundle, "wf.ezb")
        .expect(201);

      expect(applied.body.entityCounts.templates).toBe(1);
      expect(applied.body.entityCounts.workflow_templates).toBe(1);
      expect(applied.body.blobsRestored).toBeGreaterThan(0);

      // The imported link must point at the imported template, not the source's.
      const [importedLink] = await db.select()
        .from(schema.workflowTemplates)
        .innerJoin(schema.workflowVersions,
          eq(schema.workflowTemplates.workflowVersionId, schema.workflowVersions.id))
        .where(eq(schema.workflowVersions.workflowId, applied.body.rootId));
      expect(importedLink).toBeTruthy();
      const [importedTemplate] = await db.select().from(schema.templates)
        .where(eq(schema.templates.id, importedLink.workflow_templates.templateId));
      expect(importedTemplate).toBeTruthy();
    });

    it("AC 3: a workflow bound to a project-scoped DataVault previews clean and applies 201", async () => {
      const { workflowId } = await seedWorkflow({ projectId, userId });
      await seedDatavault({
        tenantId, userId, scopeType: "project", scopeId: projectId,
        attachToWorkflowId: workflowId
      });

      const wfBundle = await exportWorkflowBundle(workflowId);

      const preview = await request(baseURL)
        .post("/api/portability/import/preview")
        .set("Authorization", `Bearer ${authToken}`)
        .attach("file", wfBundle, "wf.ezb")
        .expect(200);

      expect(preview.body.errors).toEqual([]);
      expect(preview.body.canProceed).toBe(true);

      const applied = await request(baseURL)
        .post("/api/portability/import/apply")
        .set("Authorization", `Bearer ${authToken}`)
        .attach("file", wfBundle, "wf.ezb")
        .expect(201);

      expect(applied.body.entityCounts.datavault_databases).toBe(1);
      expect(applied.body.entityCounts.workflow_queries).toBe(1);

      // The imported query must resolve to the imported database.
      const [importedQuery] = await db.select().from(schema.workflowQueries)
        .where(eq(schema.workflowQueries.workflowId, applied.body.rootId));
      expect(importedQuery).toBeTruthy();
      const [importedDb] = await db.select().from(schema.datavaultDatabases)
        .where(eq(schema.datavaultDatabases.id, importedQuery.dataSourceId));
      expect(importedDb).toBeTruthy();
    });
  });

  it("IEX3-2: a List whose nested choice lost its DataVault binding imports 201 and says so", async () => {
    const { workflowId, sectionId } = await seedWorkflow({ projectId, userId });
    // A binding whose target no longer exists — the user deleted the table the
    // dropdown was wired to. Nothing can make this travel, so the import has to
    // report it rather than handing back a silently broken dropdown.
    //
    // This fixture used to be a real database that was simply never attached to
    // the workflow. IEX3-B5 made that case *travel* (the export now follows
    // references embedded in config), which is the better outcome and left this
    // test asserting a warning that correctly no longer fires. The contract
    // being tested is unchanged: an embedded reference the import cannot
    // resolve must be reported, never swallowed.
    const vault = {
      databaseId: randomUUID(),
      tableId: randomUUID(),
      columnId: randomUUID(),
    };

    await db.insert(schema.steps).values({
      workflowId, sectionId, type: "list", title: "Beneficiaries",
      alias: "beneficiaries", order: 1,
      config: {
        fields: [
          {
            kind: "question", id: randomUUID(), alias: "state", type: "choice",
            title: "State", order: 0,
            config: {
              display: "dropdown",
              allowMultiple: false,
              options: [],
              dynamicOptions: {
                type: "table_column",
                dataSourceId: vault.databaseId,
                tableId: vault.tableId,
                columnId: vault.columnId,
              },
            },
          },
        ],
      },
    });

    const wfBundle = await downloadBundle("workflow", workflowId, authToken);

    const preview = await request(baseURL)
      .post("/api/portability/import/preview")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", wfBundle, "list.ezb")
      .expect(200);

    // A lost binding is a warning, not a blocker: the workflow is still a
    // usable baseline once the user re-points it.
    expect(preview.body.canProceed).toBe(true);
    expect(preview.body.errors).toEqual([]);
    expect(preview.body.warnings.map((w: { missingId?: string }) => w.missingId))
      .toEqual(expect.arrayContaining([vault.databaseId, vault.tableId, vault.columnId]));

    const applied = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", wfBundle, "list.ezb")
      .expect(201);

    expect(applied.body.warnings.map((w: { column?: string }) => w.column))
      .toContain("config.fields[0].config.dynamicOptions.tableId");
  });

  it("AC 7: a bundle claiming a newer migrationHead is rejected with a 400", async () => {
    const zip = new AdmZip(bundle);
    const manifest = JSON.parse(zip.getEntry("manifest.json")!.getData().toString("utf8"));
    
    // Claim a migrationHead that doesn't exist (e.g. from the future)
    manifest.migrationHead = "9999_future_migration";
    
    recomputeChecksum(zip, manifest);
    zip.updateFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
    const tampered = zip.toBuffer();

    const apply = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", tampered, "bundle.ezb");

    expect(apply.status).toBe(400);
    expect(apply.body.message).toMatch(/newer version of ezBuildr/);
  });
});
