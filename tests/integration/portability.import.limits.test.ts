import { type Server } from "http";
import { eq } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import * as schema from "@shared/schema";
import { db } from "../../server/db";
import { registerRoutes } from "../../server/routes";

// The upload cap is read when the routes module is first imported, so it has to
// be shrunk before that happens — hence `vi.hoisted` and a file of its own. A
// genuine 250MB upload is not a reasonable thing to build in a test, but the cap
// itself still deserves an end-to-end proof rather than a mocked one.
vi.hoisted(() => {
  process.env.PORTABILITY_MAX_UPLOAD_BYTES = "512";
});

describe.sequential("Portability Import API — upload size cap", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let authToken: string;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    server = await registerRoutes(app);

    const port = await new Promise<number>((resolve) => {
      const testServer = server.listen(0, () => {
        const addr = testServer.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 5021);
      });
    });
    baseURL = `http://localhost:${port}`;

    const [tenant] = await db.insert(schema.tenants).values({
      name: "Test Tenant for Import Limits",
      plan: "free",
    }).returning();
    tenantId = tenant.id;

    const email = `test-import-limit-${nanoid()}@example.com`;
    const registerResponse = await request(baseURL)
      .post("/api/auth/register")
      .send({
        email,
        password: "TestPassword123!@#Strong",
        firstName: "Limit",
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
    delete process.env.PORTABILITY_MAX_UPLOAD_BYTES;
    if (tenantId) {
      await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    }
    if (server) {
      await new Promise<void>((resolve) => { server.close(() => resolve()); });
    }
  });

  it("AC 5: an upload exceeding the size cap is rejected with 413", async () => {
    const oversized = Buffer.alloc(4096, 0x41);

    const response = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", oversized, "big.ezb");

    expect(response.status).toBe(413);
    expect(response.body.message).toMatch(/upload limit/i);
  });

  it("AC 5: the cap applies to preview as well as apply", async () => {
    const oversized = Buffer.alloc(4096, 0x41);

    const response = await request(baseURL)
      .post("/api/portability/import/preview")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", oversized, "big.ezb");

    expect(response.status).toBe(413);
  });
});
