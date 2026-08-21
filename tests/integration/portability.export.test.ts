import { type Server } from "http";
import { eq, and } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as schema from "@shared/schema";
import { db } from "../../server/db";
import { rlsContext } from "../../server/middleware/rlsContext";
import { registerRoutes } from "../../server/routes";
import { BundleReader } from "../../server/services/portability/bundleReader";
import { seedWorkflow, seedTemplate, seedDatavault } from "../helpers/bundleTestHelper";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe.sequential("Portability Export API Integration Tests", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let authToken: string;
  let tenantId: string;
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    process.env.TEST_RATE_LIMIT = "1"; // Enable rate limiter for test (AC 6)
    
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    // RLS-2d: mounted BEFORE registerRoutes, mirroring server/index.ts /
    // server/production.ts — this suite builds its own app rather than using
    // the shared integration harness, so it never got rlsContext for free.
    // Without it, ProjectService's withCurrentTenant() has no tenant to
    // read and every POST /api/projects 500s with "RLS: no tenant in context."
    app.use(rlsContext);
    server = await registerRoutes(app);

    const port = await new Promise<number>((resolve) => {
      const testServer = server.listen(0, () => {
        const addr = testServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5020;
        resolve(port);
      });
    });
    baseURL = `http://localhost:${port}`;

    const [tenant] = await getOwnerDb().insert(schema.tenants).values({
      name: "Test Tenant for Portability Export",
      plan: "free",
    }).returning();
    tenantId = tenant.id;

    const email = `test-export-${nanoid()}@example.com`;
    const registerResponse = await request(baseURL)
      .post("/api/auth/register")
      .send({
        email,
        password: "TestPassword123!@#Strong",
        firstName: "Export",
        lastName: "User",
      })
      .expect(201);
    authToken = registerResponse.body.token;
    userId = registerResponse.body.user.id;

    await getOwnerDb().update(schema.users)
      .set({ tenantId, tenantRole: "owner" })
      .where(eq(schema.users.id, userId));
  });

  afterAll(async () => {
    delete process.env.TEST_RATE_LIMIT;
    if (tenantId) {
      await getOwnerDb().delete(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenantId));
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    }
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  beforeEach(async () => {
    const response = await request(baseURL)
      .post("/api/projects")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: `Export Project ${nanoid()}` })
      .expect(201);
    projectId = response.body.id;
    
    // Clear audit logs for the user to assert exactly one row per test
    await getOwnerDb().delete(schema.auditLogs).where(eq(schema.auditLogs.userId, userId));
  });

  it("AC 1 & 5: should return a .ezb zip with correct headers and log exactly one audit_logs row", async () => {
    const response = await request(baseURL)
      .get(`/api/portability/export/project/${projectId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toMatch(/attachment; filename="ezbuildr-project-.*-export\.ezb"/);
    
    // Verify Audit Log (AC 5)
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.userId, userId), eq(schema.auditLogs.action, "data_exported")));
      
    expect(logs).toHaveLength(1);
    const log = logs[0];
    expect(log.entityId).toBe(projectId);
    expect(log.entityType).toBe("project");
    expect(log.resourceType).toBe("project");
    expect(log.resourceId).toBe(projectId);
    
    const changes = log.changes as Record<string, unknown>;
    expect(changes).toBeDefined();
    expect(changes["scope"]).toBe("project");
    expect(changes["entityCounts"]).toBeDefined();
    expect(typeof changes["blobCount"]).toBe("number");
    expect(typeof changes["sizeBytes"]).toBe("number");
  });

  it("AC 1: streams a real, openable bundle rather than only the right headers", async () => {
    const response = await request(baseURL)
      .get(`/api/portability/export/project/${projectId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    // Headers alone would pass even if the route streamed garbage, so open it.
    const tmpPath = path.join(os.tmpdir(), `it_export_${nanoid()}.ezb`);
    await fs.promises.writeFile(tmpPath, response.body as Buffer);
    const reader = new BundleReader(tmpPath);
    await reader.open();

    expect(reader.manifest.scope).toBe("project");
    expect(reader.manifest.rootIds).toContain(projectId);
    expect(reader.manifest.entityCounts["projects"]).toBe(1);

    await fs.promises.rm(tmpPath, { force: true });
  });

  it("AC 1: all three scope routes are reachable and scoped correctly", async () => {
    // The project route is covered above; these two were registered but never
    // exercised, so a typo in either path or scope would have shipped.
    const workflowResponse = await request(baseURL)
      .post(`/api/workflows`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ projectId, title: `Export WF ${nanoid()}`, name: `export_wf_${nanoid()}` })
      .expect(201);
    const workflowId = workflowResponse.body.id as string;

    await request(baseURL)
      .get(`/api/portability/export/workflow/${workflowId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200)
      .expect("content-type", "application/zip");

    // The database route exists and enforces authorization rather than 500ing.
    const missingDb = await request(baseURL)
      .get(`/api/portability/export/database/123e4567-e89b-12d3-a456-426614174000`)
      .set("Authorization", `Bearer ${authToken}`);
    expect([403, 404]).toContain(missingDb.status);
  });

  it("AC 2: should return 401 unauthenticated", async () => {
    await request(baseURL)
      .get(`/api/portability/export/project/${projectId}`)
      .expect(401);
  });

  it("AC 6: anonymous traffic must not consume an authenticated user's rate budget", async () => {
    // Regression guard. With the limiter mounted ahead of hybridAuth, ten
    // unauthenticated requests exhausted the per-IP window and the next
    // legitimate export got a 429 — an anonymous DoS on the export endpoint.
    for (let i = 0; i < 12; i += 1) {
      await request(baseURL)
        .get(`/api/portability/export/project/${projectId}`)
        .expect(401);
    }

    await request(baseURL)
      .get(`/api/portability/export/project/${projectId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
  });

  it("AC 3: should return 403 for authenticated user without access", async () => {
    // Create another user in a different tenant
    const [otherTenant] = await getOwnerDb().insert(schema.tenants).values({
      name: `Other Tenant ${nanoid()}`,
      plan: "free",
    }).returning();
    
    const email = `other-export-${nanoid()}@example.com`;
    const registerResponse = await request(baseURL)
      .post("/api/auth/register")
      .send({
        email,
        password: "TestPassword123!@#Strong",
        firstName: "Other",
        lastName: "User",
      })
      .expect(201);
    const otherAuthToken = registerResponse.body.token;
    const otherUserId = registerResponse.body.user.id;
    
    await getOwnerDb().update(schema.users)
      .set({ tenantId: otherTenant.id, tenantRole: "owner" })
      .where(eq(schema.users.id, otherUserId));

    const response = await request(baseURL)
      .get(`/api/portability/export/project/${projectId}`)
      .set("Authorization", `Bearer ${otherAuthToken}`)
      .expect(403);
      
    expect(response.body.message).toMatch(/Access denied/i);
    
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, otherTenant.id));
  });

  it("AC 4: should return 404 for non-existent root id", async () => {
    const fakeId = "123e4567-e89b-12d3-a456-426614174000";
    await request(baseURL)
      .get(`/api/portability/export/project/${fakeId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(404);
  });

  it("IEX2-17 AC 2 & 3: should refuse user with only 'view' role (403), but allow 'edit' role", async () => {
    const prevRateLimit = process.env.TEST_RATE_LIMIT;
    delete process.env.TEST_RATE_LIMIT;

    try {
      // 1. Create a collaborator user in the same tenant
      const email = `collab-export-${nanoid()}@example.com`;
      const registerResponse = await request(baseURL)
        .post("/api/auth/register")
        .send({
          email,
          password: "TestPassword123!@#Strong",
          firstName: "Collab",
          lastName: "User",
        })
        .expect(201);
      const collabAuthToken = registerResponse.body.token;
      const collabUserId = registerResponse.body.user.id;
      
      // Put them in the same tenant as a normal member, not owner, so they don't get implicit edit
      await getOwnerDb().update(schema.users)
        .set({ tenantId, tenantRole: "viewer" })
        .where(eq(schema.users.id, collabUserId));
        
      // 2. Setup workflow and datavault for testing
      const workflowResponse = await request(baseURL)
        .post(`/api/workflows`)
        .set("Authorization", `Bearer ${authToken}`) // original owner token
        .send({ projectId, title: `Test WF ${nanoid()}`, name: `test_wf_${nanoid()}` })
        .expect(201);
      const workflowId = workflowResponse.body.id;
      
      const [database] = await getOwnerDb().insert(schema.datavaultDatabases).values({
        name: "Test Database",
        tenantId,
        ownerType: "user",
        ownerUuid: userId, // owner is original user
        scopeType: "project",
        scopeId: projectId,
      }).returning();
      const databaseId = database.id;

      // 3. Grant 'view' access on all 3 to the collab user
      await getOwnerDb().insert(schema.projectAccess).values({
        projectId, principalType: "user", principalId: collabUserId, role: "view"
      });
      await getOwnerDb().insert(schema.workflowAccess).values({
        workflowId, principalType: "user", principalId: collabUserId, role: "view"
      });
      await getOwnerDb().insert(schema.datavaultDatabaseAccess).values({
        databaseId, principalType: "user", principalId: collabUserId, role: "view"
      });

      // 4. Assert 'view' is rejected with 403 on all scopes (AC 2)
      const viewProj = await request(baseURL)
        .get(`/api/portability/export/project/${projectId}`)
        .set("Authorization", `Bearer ${collabAuthToken}`);
      expect(viewProj.status).toBe(403);
      
      const viewWf = await request(baseURL)
        .get(`/api/portability/export/workflow/${workflowId}`)
        .set("Authorization", `Bearer ${collabAuthToken}`);
      expect(viewWf.status).toBe(403);
      
      const viewDb = await request(baseURL)
        .get(`/api/portability/export/database/${databaseId}`)
        .set("Authorization", `Bearer ${collabAuthToken}`);
      expect(viewDb.status).toBe(403);

      // 5. Upgrade to 'edit'
      await getOwnerDb().update(schema.projectAccess)
        .set({ role: "edit" }).where(eq(schema.projectAccess.principalId, collabUserId));
      await getOwnerDb().update(schema.workflowAccess)
        .set({ role: "edit" }).where(eq(schema.workflowAccess.principalId, collabUserId));
      await getOwnerDb().update(schema.datavaultDatabaseAccess)
        .set({ role: "edit" }).where(eq(schema.datavaultDatabaseAccess.principalId, collabUserId));
        
      // 6. Assert 'edit' succeeds (AC 3)
      await request(baseURL)
        .get(`/api/portability/export/project/${projectId}`)
        .set("Authorization", `Bearer ${collabAuthToken}`)
        .expect(200)
        .expect("content-type", "application/zip");
        
      await request(baseURL)
        .get(`/api/portability/export/workflow/${workflowId}`)
        .set("Authorization", `Bearer ${collabAuthToken}`)
        .expect(200)
        .expect("content-type", "application/zip");
        
      await request(baseURL)
        .get(`/api/portability/export/database/${databaseId}`)
        .set("Authorization", `Bearer ${collabAuthToken}`)
        .expect(200)
        .expect("content-type", "application/zip");
    } finally {
      if (prevRateLimit !== undefined) {
        process.env.TEST_RATE_LIMIT = prevRateLimit;
      }
    }
  });

  it("IEX2-17 AC 4: user with project-level edit can export an inherited database", async () => {
    const prevRateLimit = process.env.TEST_RATE_LIMIT;
    delete process.env.TEST_RATE_LIMIT;

    try {
      // 1. Create a collaborator user in the same tenant
      const email = `collab2-${nanoid()}@example.com`;
      const registerResponse = await request(baseURL)
        .post("/api/auth/register")
        .send({
          email,
          password: "TestPassword123!@#Strong",
          firstName: "Collab2",
          lastName: "User",
        })
        .expect(201);
      const collabAuthToken = registerResponse.body.token;
      const collabUserId = registerResponse.body.user.id;
      
      await getOwnerDb().update(schema.users)
        .set({ tenantId, tenantRole: "viewer" })
        .where(eq(schema.users.id, collabUserId));

      const [database] = await getOwnerDb().insert(schema.datavaultDatabases).values({
        name: "Inherited DB",
        tenantId,
        ownerType: "user",
        ownerUuid: userId,
        scopeType: "project",
        scopeId: projectId,
      }).returning();
      
      // Give project-level edit
      await getOwnerDb().insert(schema.projectAccess).values({
        projectId, principalType: "user", principalId: collabUserId, role: "edit"
      });
      // Give no specific database access!
      
      // Assert export database succeeds (inherits from project)
      await request(baseURL)
        .get(`/api/portability/export/database/${database.id}`)
        .set("Authorization", `Bearer ${collabAuthToken}`)
        .expect(200)
        .expect("content-type", "application/zip");
    } finally {
      if (prevRateLimit !== undefined) {
        process.env.TEST_RATE_LIMIT = prevRateLimit;
      }
    }
  });

  describe("IEX3-1: a workflow-scope bundle carries what its own rows reference", () => {
    /**
     * Every case here exports more than once, so the rate limiter (armed in
     * the outer beforeAll for AC 6) has to be off — same pattern as the
     * IEX2-17 cases above.
     */
    async function withoutRateLimit<T>(fn: () => Promise<T>): Promise<T> {
      const prev = process.env.TEST_RATE_LIMIT;
      delete process.env.TEST_RATE_LIMIT;
      try {
        return await fn();
      } finally {
        if (prev !== undefined) {
          process.env.TEST_RATE_LIMIT = prev;
        }
      }
    }

    async function exportWorkflow(workflowId: string, token = authToken): Promise<BundleReader> {
      const response = await request(baseURL)
        .get(`/api/portability/export/workflow/${workflowId}`)
        .set("Authorization", `Bearer ${token}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);

      const tmpPath = path.join(os.tmpdir(), `iex3_export_${nanoid()}.ezb`);
      await fs.promises.writeFile(tmpPath, response.body as Buffer);
      const reader = new BundleReader(tmpPath);
      await reader.open();
      return reader;
    }

    async function idsIn(reader: BundleReader, entity: string): Promise<string[]> {
      const ids: string[] = [];
      for await (const row of reader.readEntityStream(entity)) {
        ids.push((row as { id: string }).id);
      }
      return ids;
    }

    it("AC 1 & 5: carries the referenced template, its version and its blob — and no other template", async () => {
      await withoutRateLimit(async () => {
        const { workflowId } = await seedWorkflow({ projectId, userId });
        const referenced = await seedTemplate({
          projectId, userId, attachToWorkflowId: workflowId, name: "Referenced Letter"
        });
        // Control: same project, never attached to this workflow. Without it,
        // "the right template is present" would also pass for an exporter that
        // dumped the project's entire template library.
        const unreferenced = await seedTemplate({
          projectId, userId, attachToWorkflowId: null, name: "Unrelated Letter"
        });

        const reader = await exportWorkflow(workflowId);

        expect(await idsIn(reader, "templates")).toEqual([referenced.templateId]);
        expect(await idsIn(reader, "templates")).not.toContain(unreferenced.templateId);
        expect(reader.manifest.entityCounts["template_versions"]).toBe(1);
        expect(reader.manifest.entityCounts["workflow_templates"]).toBe(1);

        // The row is useless without the file it points at.
        const blobIndex = await reader.readBlobIndex();
        expect(Object.keys(blobIndex)).toContain(referenced.fileRef);
        expect(reader.manifest.blobCount).toBeGreaterThan(0);
      });
    });

    it("AC 3 & 5: carries a referenced project-scoped DataVault database and its data — and no other database", async () => {
      await withoutRateLimit(async () => {
        const { workflowId } = await seedWorkflow({ projectId, userId });
        const referenced = await seedDatavault({
          tenantId, userId, scopeType: "project", scopeId: projectId,
          attachToWorkflowId: workflowId, name: "Referenced DB"
        });
        const unreferenced = await seedDatavault({
          tenantId, userId, scopeType: "project", scopeId: projectId,
          attachToWorkflowId: null, name: "Unrelated DB"
        });

        const reader = await exportWorkflow(workflowId);

        expect(await idsIn(reader, "datavault_databases")).toEqual([referenced.databaseId]);
        expect(await idsIn(reader, "datavault_databases")).not.toContain(unreferenced.databaseId);
        expect(await idsIn(reader, "datavault_tables")).toEqual([referenced.tableId]);
        expect(await idsIn(reader, "datavault_columns")).toEqual([referenced.columnId]);
        expect(reader.manifest.entityCounts["datavault_rows"]).toBe(1);
        expect(reader.manifest.entityCounts["datavault_values"]).toBe(1);
        // The rows that made the old bundle un-importable are present and resolvable.
        expect(reader.manifest.entityCounts["workflow_queries"]).toBe(1);
        expect(reader.manifest.entityCounts["workflow_data_sources"]).toBe(1);
      });
    });

    it("IEX3-B5: a database bound only from a step config still travels", async () => {
      await withoutRateLimit(async () => {
        // The case the reference collector used to miss entirely: a choice
        // question wired straight to a table through dynamicOptions, with the
        // workflow never registering it as a data source. The database was left
        // behind and the import reported a broken binding — correct, but the
        // bundle was needlessly incomplete.
        const { workflowId, sectionId } = await seedWorkflow({ projectId, userId });
        const bound = await seedDatavault({
          tenantId, userId, scopeType: "project", scopeId: projectId,
          attachToWorkflowId: null, name: "Config-bound DB"
        });
        const unrelated = await seedDatavault({
          tenantId, userId, scopeType: "project", scopeId: projectId,
          attachToWorkflowId: null, name: "Unrelated DB"
        });

        await getOwnerDb().insert(schema.steps).values({
          workflowId, sectionId, type: "choice", title: "Home state",
          alias: "home_state", order: 1,
          config: {
            dynamicOptions: {
              type: "table_column",
              // Deliberately names the table and column but NOT the database —
              // the collector has to resolve upward to find it.
              tableId: bound.tableId,
              columnId: bound.columnId,
            },
          },
        });

        const reader = await exportWorkflow(workflowId);

        expect(await idsIn(reader, "datavault_databases")).toEqual([bound.databaseId]);
        expect(await idsIn(reader, "datavault_databases")).not.toContain(unrelated.databaseId);
        expect(await idsIn(reader, "datavault_tables")).toEqual([bound.tableId]);
        expect(await idsIn(reader, "datavault_columns")).toEqual([bound.columnId]);
      });
    });

    it("IEX3-B5: a config-bound database the caller cannot edit is still refused", async () => {
      await withoutRateLimit(async () => {
        // B5 widened what reaches the ACL gate — a step config can now pull a
        // database into the candidate set. That must not become a way around
        // IEX2-17's rule that exporting a database requires edit on it, or
        // anyone with edit on one workflow could exfiltrate a tenant-wide
        // DataVault by pointing a dropdown at it.
        const collabEmail = `collab-b5-${nanoid()}@example.com`;
        const collabRegister = await request(baseURL)
          .post("/api/auth/register")
          .send({
            email: collabEmail,
            password: "TestPassword123!@#Strong",
            firstName: "Collab",
            lastName: "B5",
          })
          .expect(201);
        const collabToken = collabRegister.body.token as string;
        const collabUserId = collabRegister.body.user.id as string;
        await getOwnerDb().update(schema.users)
          .set({ tenantId, tenantRole: "viewer" })
          .where(eq(schema.users.id, collabUserId));

        const { workflowId, sectionId } = await seedWorkflow({ projectId, userId });
        const shared = await seedDatavault({
          tenantId, userId, scopeType: "account", scopeId: null,
          attachToWorkflowId: null, name: "Not Yours To Export"
        });

        await getOwnerDb().insert(schema.steps).values({
          workflowId, sectionId, type: "choice", title: "Pick one",
          alias: "pick_one", order: 1,
          config: {
            dynamicOptions: {
              type: "table_column",
              tableId: shared.tableId,
              columnId: shared.columnId,
            },
          },
        });

        await getOwnerDb().insert(schema.workflowAccess).values({
          workflowId, principalType: "user", principalId: collabUserId, role: "edit"
        });

        const reader = await exportWorkflow(workflowId, collabToken);

        expect(await idsIn(reader, "datavault_databases")).toEqual([]);
        expect(await idsIn(reader, "datavault_tables")).toEqual([]);
        const warnings = reader.manifest.warnings ?? [];
        expect(warnings.some(w =>
          w.type === "dangling_reference" &&
          w.entity === "datavault_databases" &&
          w.missingId === shared.databaseId
        )).toBe(true);
      });
    });

    it("AC 4: an account-scoped database the caller owns travels with the workflow", async () => {
      await withoutRateLimit(async () => {
        const { workflowId } = await seedWorkflow({ projectId, userId });
        const shared = await seedDatavault({
          tenantId, userId, scopeType: "account", scopeId: null,
          attachToWorkflowId: workflowId, name: "Tenant-wide DB"
        });

        const reader = await exportWorkflow(workflowId);

        expect(await idsIn(reader, "datavault_databases")).toEqual([shared.databaseId]);
        expect(reader.manifest.entityCounts["workflow_queries"]).toBe(1);
      });
    });

    it("AC 4: a database the caller cannot export is omitted with a warning, and its referencing rows are dropped", async () => {
      await withoutRateLimit(async () => {
        // A collaborator with edit on the workflow but no claim on a
        // tenant-wide database owned by someone else. Sweeping it into their
        // export on the strength of workflow-edit alone would be an
        // exfiltration path (IEX2-17 settled that exporting a database needs
        // edit on that database).
        const collabEmail = `collab-iex3-${nanoid()}@example.com`;
        const collabRegister = await request(baseURL)
          .post("/api/auth/register")
          .send({
            email: collabEmail,
            password: "TestPassword123!@#Strong",
            firstName: "Collab",
            lastName: "Iex3",
          })
          .expect(201);
        const collabToken = collabRegister.body.token as string;
        const collabUserId = collabRegister.body.user.id as string;
        await getOwnerDb().update(schema.users)
          .set({ tenantId, tenantRole: "viewer" })
          .where(eq(schema.users.id, collabUserId));

        const { workflowId } = await seedWorkflow({ projectId, userId });
        const shared = await seedDatavault({
          tenantId, userId, scopeType: "account", scopeId: null,
          attachToWorkflowId: workflowId, name: "Someone Else's DB"
        });

        await getOwnerDb().insert(schema.workflowAccess).values({
          workflowId, principalType: "user", principalId: collabUserId, role: "edit"
        });

        const reader = await exportWorkflow(workflowId, collabToken);

        expect(await idsIn(reader, "datavault_databases")).toEqual([]);
        const warnings = reader.manifest.warnings ?? [];
        expect(warnings.some(w =>
          w.type === "dangling_reference" &&
          w.entity === "datavault_databases" &&
          w.missingId === shared.databaseId
        )).toBe(true);

        // The NOT NULL referrers must not ship pointing at an absent database,
        // or the bundle is a dead artifact — the exact failure IEX3-1 exists
        // to remove.
        expect(reader.manifest.entityCounts["workflow_queries"] ?? 0).toBe(0);
        expect(reader.manifest.entityCounts["workflow_data_sources"] ?? 0).toBe(0);
        expect(warnings.some(w =>
          w.type === "dangling_reference" && w.entity === "workflow_queries"
        )).toBe(true);
      });
    });
  });

  describe("IEX3-4: the manifest route reports an export without producing one", () => {
    async function withoutRateLimit<T>(fn: () => Promise<T>): Promise<T> {
      const prev = process.env.TEST_RATE_LIMIT;
      delete process.env.TEST_RATE_LIMIT;
      try {
        return await fn();
      } finally {
        if (prev !== undefined) {
          process.env.TEST_RATE_LIMIT = prev;
        }
      }
    }

    it("AC 1: returns the manifest as JSON and leaves no temp file behind", async () => {
      await withoutRateLimit(async () => {
        const { workflowId } = await seedWorkflow({ projectId, userId });
        await seedTemplate({ projectId, userId, attachToWorkflowId: workflowId });

        const before = (await fs.promises.readdir(os.tmpdir()))
          .filter((f) => f.startsWith("export_")).length;

        const response = await request(baseURL)
          .get(`/api/portability/export/workflow/${workflowId}/manifest`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200)
          .expect("content-type", /json/);

        expect(response.body.entityCounts.workflows).toBe(1);
        expect(response.body.entityCounts.steps).toBe(1);
        expect(response.body.entityCounts.templates).toBe(1);
        expect(typeof response.body.blobCount).toBe("number");
        expect(response.body.scope).toBe("workflow");

        // The whole point of the route: it does the real work and keeps none
        // of the bytes.
        const after = (await fs.promises.readdir(os.tmpdir()))
          .filter((f) => f.startsWith("export_")).length;
        expect(after).toBe(before);
      });
    });

    it("AC 1: reports requiresReentry and secret_scan warnings before any download", async () => {
      await withoutRateLimit(async () => {
        const { workflowId } = await seedWorkflow({ projectId, userId });

        // A pasted-looking credential in hook code is exactly what the user
        // needs told *before* they share the file.
        await getOwnerDb().insert(schema.transformBlocks).values({
          workflowId,
          name: "Leaky block",
          language: "javascript",
          code: 'const apiKey = "sk-livesecretvaluethatlookslikeakey123456";\nemit(apiKey);',
          outputKey: "leaky",
          order: 0,
        });

        const response = await request(baseURL)
          .get(`/api/portability/export/workflow/${workflowId}/manifest`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200);

        const scans = (response.body.warnings ?? []).filter(
          (w: { type: string }) => w.type === "secret_scan"
        );
        expect(scans.length).toBeGreaterThan(0);
        expect(scans[0].entity).toBe("transform_blocks");
        expect(typeof scans[0].line).toBe("number");
        // The manifest must never quote the match back at the user.
        expect(JSON.stringify(response.body)).not.toContain("sk-livesecretvalue");
      });
    });

    it("AC 2: enforces the same authorization as the streaming route", async () => {
      await withoutRateLimit(async () => {
        const { workflowId } = await seedWorkflow({ projectId, userId });

        await request(baseURL)
          .get(`/api/portability/export/workflow/${workflowId}/manifest`)
          .expect(401);

        await request(baseURL)
          .get(`/api/portability/export/workflow/123e4567-e89b-12d3-a456-426614174000/manifest`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(404);

        // A view-only collaborator can open the workflow but must not be able
        // to enumerate what an export of it would contain.
        const collabRegister = await request(baseURL)
          .post("/api/auth/register")
          .send({
            email: `collab-manifest-${nanoid()}@example.com`,
            password: "TestPassword123!@#Strong",
            firstName: "View", lastName: "Only",
          })
          .expect(201);
        const collabToken = collabRegister.body.token as string;
        const collabUserId = collabRegister.body.user.id as string;
        await getOwnerDb().update(schema.users)
          .set({ tenantId, tenantRole: "viewer" })
          .where(eq(schema.users.id, collabUserId));
        await getOwnerDb().insert(schema.workflowAccess).values({
          workflowId, principalType: "user", principalId: collabUserId, role: "view"
        });

        await request(baseURL)
          .get(`/api/portability/export/workflow/${workflowId}/manifest`)
          .set("Authorization", `Bearer ${collabToken}`)
          .expect(403);
      });
    });
  });

  it("AC 6: should enforce rate limit returning 429", async () => {
    const fakeId = "123e4567-e89b-12d3-a456-426614174000";
    
    let rateLimited = false;
    for (let i = 0; i < 15; i++) {
      const response = await request(baseURL)
        .get(`/api/portability/export/project/${fakeId}`)
        .set("Authorization", `Bearer ${authToken}`);
        
      if (response.status === 429) {
        rateLimited = true;
        break;
      }
    }
    
    expect(rateLimited).toBe(true);
  });
});

