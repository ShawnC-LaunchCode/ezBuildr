import { type Server } from "http";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { eq } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import * as schema from "@shared/schema";
import { rlsContext } from "../../server/middleware/rlsContext";
import { registerRoutes } from "../../server/routes";
import { BundleWriter } from "../../server/services/portability/bundleWriter";
import { FORMAT_VERSION, type BundleManifest } from "../../server/services/portability/bundleFormat";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

// The upload cap, and the reader's declared-size limits (IEX2-10), are all
// read when their modules are first imported, so every override has to be in
// place before that happens — hence `vi.hoisted` and a file of its own. A
// genuine 250MB upload (or a genuinely oversized entry) is not a reasonable
// thing to build in a test, but the caps themselves still deserve an
// end-to-end proof rather than a mocked one — so the caps are shrunk instead
// of the payloads being grown.
vi.hoisted(() => {
  process.env.PORTABILITY_MAX_UPLOAD_BYTES = "512";
  process.env.PORTABILITY_MAX_ENTRY_BYTES = "50";
});

/** A minimal, real, checksum-valid bundle -- no entities or blobs needed. */
async function buildMinimalBundle(): Promise<Buffer> {
  const outPath = path.join(os.tmpdir(), `tiny-limits-${nanoid()}.ezb`);
  const writer = new BundleWriter(outPath);
  const manifest: BundleManifest = {
    formatVersion: FORMAT_VERSION,
    appVersion: "test",
    migrationHead: null,
    scope: "workflow",
    rootIds: [],
    sourceSystem: "test",
    createdAt: new Date().toISOString(),
    entityCounts: {},
    blobCount: 0,
    checksum: ""
  };
  await writer.writeManifest(manifest);
  const finalPath = await writer.finalize();
  const buf = await fs.promises.readFile(finalPath);
  await fs.promises.rm(finalPath, { force: true });
  return buf;
}

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
    // RLS-2d: mounted BEFORE registerRoutes, mirroring server/index.ts /
    // server/production.ts — see the note in portability.export.test.ts.
    app.use(rlsContext);
    server = await registerRoutes(app);

    const port = await new Promise<number>((resolve) => {
      const testServer = server.listen(0, () => {
        const addr = testServer.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 5021);
      });
    });
    baseURL = `http://localhost:${port}`;

    const [tenant] = await getOwnerDb().insert(schema.tenants).values({
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

    await getOwnerDb().update(schema.users)
      .set({ tenantId, tenantRole: "owner" })
      .where(eq(schema.users.id, userId));
  });

  afterAll(async () => {
    delete process.env.PORTABILITY_MAX_UPLOAD_BYTES;
    delete process.env.PORTABILITY_MAX_ENTRY_BYTES;
    if (tenantId) {
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
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

  it("IEX2-10 AC 5: a bundle whose declared entry size exceeds the (env-overridable) reader limit is rejected with 400, not a crash", async () => {
    const bundle = await buildMinimalBundle();
    // The bundle itself is a normal small file -- it clears the multer upload
    // cap. PORTABILITY_MAX_ENTRY_BYTES=50 is what rejects it: manifest.json
    // alone is well over 50 bytes, so the reader's own declared-size gate
    // (not the upload gate) is what fires here.
    expect(bundle.length).toBeLessThan(512);

    const response = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", bundle, "tiny.ezb");

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/single entry size overflow/i);
  });
});
