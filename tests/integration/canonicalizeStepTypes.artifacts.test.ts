import { execSync } from "child_process";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@shared/schema";

import { canonicalizeGraphJson } from "../../scripts/canonicalizeStepTypes";
import { computeChecksum, verifyChecksum } from "../../server/utils/checksum";
import {
  createAuthenticatedAgent,
  setupIntegrationTest,
  type IntegrationTestContext,
} from "../helpers/integrationTestHelper";
import { getOwnerDb } from "../helpers/ownerDb";

type VersionRow = typeof schema.workflowVersions.$inferSelect;
type BlueprintRow = typeof schema.workflowBlueprints.$inferSelect;

function signatureConfig(): Record<string, unknown> {
  return {
    signerRole: "Applicant",
    routingOrder: 1,
    documents: [{ id: "signature-document", documentId: "template-id" }],
  };
}

function buildGraph(projectId: string, steps: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    title: `STB-20 graph ${nanoid()}`,
    description: "Stored graph fixture",
    projectId,
    settings: {},
    intakeConfig: {},
    sections: [],
    pages: [{
      id: `page-${nanoid()}`,
      sectionId: null,
      title: "Stored page",
      order: 0,
      config: {},
      steps,
    }],
    logicRules: [],
    transformBlocks: [],
    lifecycleHooks: [],
    documentHooks: [],
  };
}

function versionMetadata(row: VersionRow): Omit<VersionRow, "graphJson" | "checksum"> {
  const { graphJson: _graphJson, checksum: _checksum, ...metadata } = row;
  return metadata;
}

function blueprintMetadata(row: BlueprintRow): Omit<BlueprintRow, "graphJson"> {
  const { graphJson: _graphJson, ...metadata } = row;
  return metadata;
}

function graphSteps(graphJson: unknown): Array<Record<string, unknown>> {
  const graph = graphJson as { pages: Array<{ steps: Array<Record<string, unknown>> }> };
  return graph.pages.flatMap((page) => page.steps);
}

describe.sequential("STB-20 canonicalize stored version and blueprint artifacts", () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let checksummedVersionBefore: VersionRow;
  let nullChecksumVersionBefore: VersionRow;
  let unchangedVersionBefore: VersionRow;
  let blueprintBefore: BlueprintRow;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: "STB-20 artifact canonicalization",
      createProject: true,
      userRole: "admin",
      tenantRole: "owner",
    });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const workflowResponse = await agent
      .post("/api/workflows")
      .send({ title: "STB-20 source workflow", projectId: ctx.projectId });
    expect(workflowResponse.status).toBe(201);
    workflowId = workflowResponse.body.id as string;

    const legacyVersionGraph = buildGraph(ctx.projectId!, [
      {
        id: `step-${nanoid()}`,
        type: "short_text",
        title: "Legacy text",
        alias: "legacy_text",
        order: 0,
        config: { placeholder: "Name", removedKey: true },
      },
      {
        id: `step-${nanoid()}`,
        type: "list",
        title: "Legacy list",
        alias: "legacy_list",
        order: 1,
        config: {
          fields: [{
            kind: "question",
            id: `field-${nanoid()}`,
            type: "true_false",
            title: "Nested legacy boolean",
            alias: "nested_boolean",
            order: 0,
            config: { trueLabel: "True", falseLabel: "False", removedNestedKey: true },
          }],
        },
      },
      {
        id: `step-${nanoid()}`,
        type: "signature",
        title: "Legacy signature",
        alias: "legacy_signature",
        order: 2,
        config: signatureConfig(),
      },
    ]);

    const [insertedChecksummedVersion] = await getOwnerDb()
      .insert(schema.workflowVersions)
      .values({
        workflowId,
        baseId: workflowId,
        versionNumber: 20,
        isDraft: false,
        graphJson: legacyVersionGraph,
        migrationInfo: { source: "STB-20" },
        changelog: { preserved: true },
        notes: "immutable version metadata",
        checksum: "pending",
        createdBy: ctx.userId,
        published: true,
        publishedAt: new Date("2026-09-01T12:00:00.000Z"),
        createdAt: new Date("2026-09-01T12:01:00.000Z"),
        updatedAt: new Date("2026-09-01T12:02:00.000Z"),
      })
      .returning();
    [checksummedVersionBefore] = await getOwnerDb()
      .update(schema.workflowVersions)
      .set({ checksum: computeChecksum({ graphJson: insertedChecksummedVersion.graphJson }) })
      .where(eq(schema.workflowVersions.id, insertedChecksummedVersion.id))
      .returning();

    const [insertedNullChecksumVersion] = await getOwnerDb()
      .insert(schema.workflowVersions)
      .values({
        workflowId,
        versionNumber: 21,
        isDraft: true,
        graphJson: buildGraph(ctx.projectId!, [{
          id: `step-${nanoid()}`,
          type: "long_text",
          title: "Legacy long text",
          alias: "legacy_long_text",
          order: 0,
          config: { rows: 5 },
        }]),
        checksum: null,
        createdBy: ctx.userId,
        notes: "NULL checksum remains absent",
      })
      .returning();
    nullChecksumVersionBefore = insertedNullChecksumVersion;

    const canonicalGraph = buildGraph(ctx.projectId!, [{
      id: `step-${nanoid()}`,
      type: "text",
      title: "Already canonical",
      alias: "already_canonical",
      order: 0,
      config: { variant: "short" },
    }]);
    const [insertedUnchangedVersion] = await getOwnerDb()
      .insert(schema.workflowVersions)
      .values({
        workflowId,
        versionNumber: 22,
        isDraft: true,
        graphJson: canonicalGraph,
        checksum: "pending",
        createdBy: ctx.userId,
        notes: "must remain byte-identical",
      })
      .returning();
    [unchangedVersionBefore] = await getOwnerDb()
      .update(schema.workflowVersions)
      .set({ checksum: computeChecksum({ graphJson: insertedUnchangedVersion.graphJson }) })
      .where(eq(schema.workflowVersions.id, insertedUnchangedVersion.id))
      .returning();

    [blueprintBefore] = await getOwnerDb()
      .insert(schema.workflowBlueprints)
      .values({
        tenantId: ctx.tenantId,
        creatorId: ctx.userId,
        name: "STB-20 legacy signature blueprint",
        description: "immutable blueprint metadata",
        graphJson: buildGraph(ctx.projectId!, [{
          id: `step-${nanoid()}`,
          type: "signature",
          title: "Blueprint legacy signature",
          alias: "blueprint_signature",
          order: 0,
          config: signatureConfig(),
        }]),
        metadata: { preserved: true },
        sourceWorkflowId: workflowId,
        isPublic: false,
        createdAt: new Date("2026-09-01T13:01:00.000Z"),
        updatedAt: new Date("2026-09-01T13:02:00.000Z"),
      })
      .returning();
  });

  afterAll(async () => {
    if (ctx) {
      await getOwnerDb()
        .delete(schema.workflowBlueprints)
        .where(eq(schema.workflowBlueprints.tenantId, ctx.tenantId));
      await ctx.cleanup();
    }
  });

  it("AC7: dry-run walks pages[].steps[], reports a non-zero conversion count, and writes nothing", async () => {
    const out = execSync(
      `npx tsx scripts/canonicalizeStepTypes.ts --workflow-id ${workflowId}`,
      { encoding: "utf-8", env: process.env },
    );

    expect(out).toContain("DRY-RUN mode");
    expect(out).toMatch(/Version step definitions converted:\s+[1-9]\d*/);
    expect(out).toContain("Version artifacts changed:         2");
    expect(out).toContain("Blueprint artifacts changed:         1");
    expect(out).toContain("signature -> signature_block: 2");

    const checksummedVersionAfter = await getOwnerDb().query.workflowVersions.findFirst({
      where: eq(schema.workflowVersions.id, checksummedVersionBefore.id),
    });
    const blueprintAfter = await getOwnerDb().query.workflowBlueprints.findFirst({
      where: eq(schema.workflowBlueprints.id, blueprintBefore.id),
    });
    expect(checksummedVersionAfter?.graphJson).toEqual(checksummedVersionBefore.graphJson);
    expect(checksummedVersionAfter?.checksum).toBe(checksummedVersionBefore.checksum);
    expect(blueprintAfter?.graphJson).toEqual(blueprintBefore.graphJson);
  });

  it("AC8/AC9: apply repairs version checksums, preserves absent checksums and metadata, and converts signature in both stores", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    expect(databaseUrl).toBeTruthy();
    const out = execSync(
      `npx tsx scripts/canonicalizeStepTypes.ts --apply --workflow-id ${workflowId} --database-url "${databaseUrl}"`,
      { encoding: "utf-8", env: process.env },
    );

    expect(out).toContain("APPLY mode");
    expect(out).toContain("Version checksums recomputed:       1");
    expect(out).toContain("Version NULL checksums preserved:   1");
    expect(out).toContain("Transaction committed successfully.");

    const checksummedVersionAfter = await getOwnerDb().query.workflowVersions.findFirst({
      where: eq(schema.workflowVersions.id, checksummedVersionBefore.id),
    });
    const nullChecksumVersionAfter = await getOwnerDb().query.workflowVersions.findFirst({
      where: eq(schema.workflowVersions.id, nullChecksumVersionBefore.id),
    });
    const unchangedVersionAfter = await getOwnerDb().query.workflowVersions.findFirst({
      where: eq(schema.workflowVersions.id, unchangedVersionBefore.id),
    });
    const blueprintAfter = await getOwnerDb().query.workflowBlueprints.findFirst({
      where: eq(schema.workflowBlueprints.id, blueprintBefore.id),
    });

    expect(checksummedVersionAfter).toBeDefined();
    expect(checksummedVersionAfter!.checksum).not.toBe(checksummedVersionBefore.checksum);

    expect(verifyChecksum(
      { graphJson: checksummedVersionAfter!.graphJson },
      checksummedVersionAfter!.checksum!,
    )).toBe(true);

    expect(versionMetadata(checksummedVersionAfter!)).toEqual(versionMetadata(checksummedVersionBefore));

    const versionSteps = graphSteps(checksummedVersionAfter!.graphJson);
    expect(versionSteps.map((step) => step.type)).toEqual(["text", "list", "signature_block"]);
    const nestedListConfig = versionSteps[1].config as {
      fields: Array<{ type: string; config: Record<string, unknown> }>;
    };
    expect(nestedListConfig.fields[0].type).toBe("boolean");
    expect(nestedListConfig.fields[0].config).not.toHaveProperty("removedNestedKey");

    expect(nullChecksumVersionAfter?.checksum).toBeNull();
    expect(versionMetadata(nullChecksumVersionAfter!)).toEqual(versionMetadata(nullChecksumVersionBefore));
    expect(graphSteps(nullChecksumVersionAfter!.graphJson)[0].type).toBe("text");

    expect(unchangedVersionAfter?.graphJson).toEqual(unchangedVersionBefore.graphJson);
    expect(unchangedVersionAfter?.checksum).toBe(unchangedVersionBefore.checksum);
    expect(versionMetadata(unchangedVersionAfter!)).toEqual(versionMetadata(unchangedVersionBefore));

    expect(graphSteps(blueprintAfter!.graphJson)[0].type).toBe("signature_block");
    expect(blueprintMetadata(blueprintAfter!)).toEqual(blueprintMetadata(blueprintBefore));
  });

  // Reviewer, 2026-09-02. The dev Neon branch holds 56 version artifacts in the
  // pre-pages `blocks[]` shape. All of them are empty, so nothing is skipped in
  // practice -- but a shape this converter does not understand must never be
  // indistinguishable from a clean run, or the production backfill could report
  // success while leaving legacy definitions behind.
  it("counts, rather than silently skips, artifacts in an unrecognized graph shape", () => {
    const emptyLegacy = canonicalizeGraphJson({ title: "old", sections: [], blocks: [] });
    expect(emptyLegacy.unrecognizedShape).toBe(true);
    expect(emptyLegacy.unconvertedDefinitions).toBe(0);
    expect(emptyLegacy.definitionsChanged).toBe(0);

    const populatedLegacy = canonicalizeGraphJson({
      title: "old",
      blocks: [
        { id: "b1", type: "short_text", title: "Name" },
        { id: "b2", type: "yes_no", title: "Agree" },
      ],
    });
    expect(populatedLegacy.unrecognizedShape).toBe(true);
    expect(populatedLegacy.unconvertedDefinitions).toBe(2);
    // Untouched: the converter reports the shape, it does not guess at it.
    expect(populatedLegacy.graphJson).toEqual({
      title: "old",
      blocks: [
        { id: "b1", type: "short_text", title: "Name" },
        { id: "b2", type: "yes_no", title: "Agree" },
      ],
    });
  });

  it("restores converted version content and instantiates a converted blueprint through strict ingest, then audits cleanly", async () => {
    const convertedVersion = await getOwnerDb().query.workflowVersions.findFirst({
      where: eq(schema.workflowVersions.id, checksummedVersionBefore.id),
    });
    expect(convertedVersion).toBeDefined();

    const restoreResponse = await agent
      .put(`/api/workflows/${workflowId}`)
      .send(convertedVersion!.graphJson as Record<string, unknown>);
    expect(restoreResponse.status).toBe(200);

    const restoredSteps = await getOwnerDb()
      .select()
      .from(schema.steps)
      .where(eq(schema.steps.workflowId, workflowId));
    expect(restoredSteps.find((step) => step.alias === "legacy_text")?.type).toBe("text");
    expect(restoredSteps.find((step) => step.alias === "legacy_list")?.type).toBe("list");
    expect(restoredSteps.find((step) => step.alias === "legacy_signature")?.type).toBe("signature_block");

    const instantiateResponse = await agent
      .post(`/api/blueprints/${blueprintBefore.id}/instantiate`)
      .send({ projectId: ctx.projectId });
    expect(instantiateResponse.status).toBe(200);
    const instantiatedWorkflowId = instantiateResponse.body.data.workflowId as string;
    const instantiatedSteps = await getOwnerDb()
      .select()
      .from(schema.steps)
      .where(eq(schema.steps.workflowId, instantiatedWorkflowId));
    expect(instantiatedSteps).toHaveLength(1);
    expect(instantiatedSteps[0].type).toBe("signature_block");

    const storedVersion = await getOwnerDb().query.workflowVersions.findFirst({
      where: eq(schema.workflowVersions.id, checksummedVersionBefore.id),
    });
    const storedBlueprint = await getOwnerDb().query.workflowBlueprints.findFirst({
      where: eq(schema.workflowBlueprints.id, blueprintBefore.id),
    });
    expect(storedVersion?.workflowId).toBe(workflowId);
    expect(storedBlueprint?.tenantId).toBe(ctx.tenantId);

    const databaseUrl = process.env.DATABASE_URL;
    const secondApply = execSync(
      `npx tsx scripts/canonicalizeStepTypes.ts --apply --workflow-id ${workflowId} --database-url "${databaseUrl}"`,
      { encoding: "utf-8", env: process.env },
    );
    expect(secondApply).toContain("Rows changed:         0");
    expect(secondApply).toContain("Version artifacts changed:         0");
    expect(secondApply).toContain("Blueprint artifacts changed:         0");

    const audit = execSync(
      `npx tsx scripts/canonicalizeStepTypes.ts --audit --workflow-id ${workflowId}`,
      { encoding: "utf-8", env: process.env },
    );
    expect(audit).toContain("Audit passed. Zero legacy definitions found.");
  });
});
