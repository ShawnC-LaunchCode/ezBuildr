import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NextFunction, Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  generateTransforms: vi.fn(),
  reviseTransforms: vi.fn(),
  alignSchema: vi.fn(),
  debug: vi.fn(),
  autoFix: vi.fn(),
}));

vi.mock("../../server/lib/ai/transformGenerator", () => ({
  generateTransforms: mocks.generateTransforms,
}));

vi.mock("../../server/lib/ai/transformRevision", () => ({
  reviseTransforms: mocks.reviseTransforms,
}));

vi.mock("../../server/lib/transforms/schemaAlign", () => ({
  alignSchema: mocks.alignSchema,
}));

vi.mock("../../server/lib/transforms/debugger", () => ({
  TransformDebugger: {
    debug: mocks.debug,
    autoFix: mocks.autoFix,
  },
}));

vi.mock("../../server/middleware/auth", () => ({
  hybridAuth: (req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, {
      userId: "user-transform",
      tenantId: "tenant-transform",
      userRole: "builder",
    });
    next();
  },
}));

vi.mock("../../server/middleware/rbac", () => ({
  requireBuilder: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import transformRouter from "../../server/routes/api.ai.transform.routes";

describe("AI transform routes (AISL-5)", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/ai/transform", transformRouter);

  beforeEach(() => {
    mocks.generateTransforms.mockResolvedValue({
      updatedTransforms: [],
      explanation: ["generated"],
    });
    mocks.reviseTransforms.mockResolvedValue({
      updatedTransforms: [],
      diff: { added: [] },
      explanation: ["revised"],
    });
    mocks.alignSchema.mockResolvedValue({
      issues: [],
      missingTransforms: [],
    });
    mocks.debug.mockReturnValue([{ id: "issue-1" }]);
    mocks.autoFix.mockResolvedValue([{ id: "fix-1" }]);
  });

  it("threads the authenticated tenant through transform generation", async () => {
    const response = await request(app)
      .post("/api/ai/transform/generate")
      .send({ description: "Create a mapping" })
      .expect(200);

    expect(response.body).toEqual({
      updatedTransforms: [],
      explanation: ["generated"],
    });
    expect(mocks.generateTransforms).toHaveBeenCalledWith({
      workflowContext: {},
      description: "Create a mapping",
      currentTransforms: [],
    }, "tenant-transform");
  });

  it("threads the authenticated tenant through transform revision", async () => {
    const response = await request(app)
      .post("/api/ai/transform/revise")
      .send({ userRequest: "Revise the mapping" })
      .expect(200);

    expect(response.body).toEqual({
      updatedTransforms: [],
      diff: { added: [] },
      explanation: ["revised"],
    });
    expect(mocks.reviseTransforms).toHaveBeenCalledWith({
      currentTransforms: [],
      userRequest: "Revise the mapping",
      workflowContext: {},
    }, "tenant-transform");
  });

  it("preserves the deterministic debug endpoint response", async () => {
    const response = await request(app)
      .post("/api/ai/transform/debug")
      .send({ transforms: [] })
      .expect(200);

    expect(response.body).toEqual({ issues: [{ id: "issue-1" }] });
    expect(mocks.debug).toHaveBeenCalledWith([]);
  });

  it("preserves the deterministic auto-fix endpoint response", async () => {
    const response = await request(app)
      .post("/api/ai/transform/auto-fix")
      .send({ transforms: [], issues: [] })
      .expect(200);

    expect(response.body).toEqual({ fixes: [{ id: "fix-1" }] });
    expect(mocks.autoFix).toHaveBeenCalledWith([], []);
  });

  it("threads the authenticated tenant through schema alignment", async () => {
    const response = await request(app)
      .post("/api/ai/transform/schema-align")
      .send({})
      .expect(200);

    expect(response.body).toEqual({ issues: [], missingTransforms: [] });
    expect(mocks.alignSchema).toHaveBeenCalledWith({
      transforms: [],
      documents: [],
      workflowVariables: [],
    }, "tenant-transform");
  });
});
