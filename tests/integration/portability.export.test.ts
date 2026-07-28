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
import { registerRoutes } from "../../server/routes";
import { BundleReader } from "../../server/services/portability/bundleReader";

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
    server = await registerRoutes(app);

    const port = await new Promise<number>((resolve) => {
      const testServer = server.listen(0, () => {
        const addr = testServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5020;
        resolve(port);
      });
    });
    baseURL = `http://localhost:${port}`;

    const [tenant] = await db.insert(schema.tenants).values({
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

    await db.update(schema.users)
      .set({ tenantId, tenantRole: "owner" })
      .where(eq(schema.users.id, userId));
  });

  afterAll(async () => {
    delete process.env.TEST_RATE_LIMIT;
    if (tenantId) {
      await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
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
    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.userId, userId));
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
    const [otherTenant] = await db.insert(schema.tenants).values({
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
    
    await db.update(schema.users)
      .set({ tenantId: otherTenant.id, tenantRole: "owner" })
      .where(eq(schema.users.id, otherUserId));

    const response = await request(baseURL)
      .get(`/api/portability/export/project/${projectId}`)
      .set("Authorization", `Bearer ${otherAuthToken}`)
      .expect(403);
      
    expect(response.body.message).toMatch(/Access denied/i);
    
    await db.delete(schema.tenants).where(eq(schema.tenants.id, otherTenant.id));
  });

  it("AC 4: should return 404 for non-existent root id", async () => {
    const fakeId = "123e4567-e89b-12d3-a456-426614174000";
    await request(baseURL)
      .get(`/api/portability/export/project/${fakeId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(404);
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
