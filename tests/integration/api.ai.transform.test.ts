import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { aiUsage } from "../../shared/schema/ai";
import { tenants } from "../../shared/schema/auth";
import { ProviderFactory } from "../../server/services/ai/providers/ProviderFactory";

import type { NextFunction, Request, Response } from "express";
import type { IAIProvider } from "../../server/services/ai/providers/types";
import type { TaskType } from "../../server/services/ai/types";

const TENANT_ID = "00000000-0000-4000-8000-000000000505";

vi.mock("../../server/middleware/auth", () => ({
  hybridAuth: (req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, {
      userId: "user-transform-integration",
      tenantId: TENANT_ID,
      userRole: "builder",
    });
    next();
  },
}));

vi.mock("../../server/middleware/rbac", () => ({
  requireBuilder: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import transformRouter from "../../server/routes/api.ai.transform.routes";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe("AI transform usage accounting (AISL-5)", () => {
  const app = express();
  const generateResponse = vi.fn<IAIProvider["generateResponse"]>();

  app.use(express.json());
  app.use("/api/ai/transform", transformRouter);

  beforeAll(async () => {
    await getOwnerDb().insert(tenants).values({
      id: TENANT_ID,
      name: "AISL-5 Transform Tenant",
      plan: "pro",
    });
  });

  beforeEach(() => {
    vi.spyOn(ProviderFactory, "createProvider").mockReturnValue({
      generateResponse,
    } as unknown as IAIProvider);
  });

  afterEach(async () => {
    await getOwnerDb().delete(aiUsage).where(eq(aiUsage.tenantId, TENANT_ID));
  });

  afterAll(async () => {
    await getOwnerDb().delete(tenants).where(eq(tenants.id, TENANT_ID));
  });

  const cases: Array<{
    path: string;
    body: Record<string, unknown>;
    taskType: TaskType;
    responseText: string;
  }> = [
    {
      path: "/generate",
      body: { description: "Create a transform" },
      taskType: "transform_generation",
      responseText: JSON.stringify({ transforms: [] }),
    },
    {
      path: "/revise",
      body: { userRequest: "Revise the transform" },
      taskType: "transform_revision",
      responseText: JSON.stringify({ transforms: [], diff: {}, explanation: [] }),
    },
    {
      path: "/schema-align",
      body: {},
      taskType: "transform_schema_align",
      responseText: JSON.stringify({ issues: [], missingTransforms: [] }),
    },
  ];

  it.each(cases)("records $taskType usage for POST $path", async ({
    path,
    body,
    taskType,
    responseText,
  }) => {
    generateResponse.mockResolvedValue({
      text: responseText,
      usage: { inputTokens: 120, outputTokens: 30 },
    });

    await request(app)
      .post(`/api/ai/transform${path}`)
      .send(body)
      .expect(200);

    const rows = await getOwnerDb().select().from(aiUsage).where(eq(aiUsage.tenantId, TENANT_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: TENANT_ID,
      taskType,
      inputTokens: 120,
      outputTokens: 30,
    });
  });
});
