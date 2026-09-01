import { randomUUID } from "crypto";
import { type Server } from "http";
import AdmZip from "adm-zip";
import { and, eq, ne } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import * as schema from "@shared/schema";
import { CANONICAL_STEP_TYPES, LIST_FIELD_QUESTION_TYPES, type CanonicalStepType } from "@shared/types/stepConfigs";
import { validateCanonicalStepConfig } from "@shared/validation/stepConfigSchemas";
import { rlsContext } from "../../server/middleware/rlsContext";
import { registerRoutes } from "../../server/routes";
import { seedTemplate } from "../helpers/bundleTestHelper";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

/**
 * STB-18 — portability coverage proves canonical-only round trips.
 *
 * Before this file, IEX3-3's suite proved that BYTES round-trip, with
 * fixtures for every enum dialect including configs that never matched a
 * current schema (`number_advanced: { decimalPlaces: 3 }`,
 * `display_advanced: { showBorder: true }`). Byte-equality never asked
 * whether the config was supported, so those dead keys round-tripped clean
 * forever.
 *
 * This file derives its fixtures from `CANONICAL_STEP_TYPES` (the 18 stored
 * identities named in the STB initiative's Decision 1) instead of the full,
 * still-wider `stepTypeEnum`, and proves each fixture is not just present
 * but *canonically valid* via `validateCanonicalStepConfig` — the same
 * write-boundary validator STB-17 built and STB-18 wires into
 * `ImportService` (see `ImportService.validateCanonicalStepEntity`). Adding
 * a canonical type without a fixture here fails AC 1, the same discipline
 * `LIST_FIELD_QUESTION_TYPES` uses for List fields.
 */

/** A distinctive, canonically-valid config per canonical step type. */
function buildStepConfigs(templateId: string): Record<CanonicalStepType, Record<string, unknown>> {
  const choiceOptions = () => [
    { id: randomUUID(), label: "Yes", alias: "yes" },
    { id: randomUUID(), label: "No", alias: "no" },
  ];

  return {
    text: {
      variant: "long",
      validation: { minLength: 5, maxLength: 500 },
      placeholder: "Tell us more",
      helpText: "Be detailed",
      autoComplete: "off",
    },
    boolean: {
      trueLabel: "I agree", falseLabel: "I do not agree",
      displayStyle: "checkbox", trueAlias: "agreed", falseAlias: "declined",
    },
    phone: { format: "international", validation: { strict: true }, placeholder: "+1 555 555 5555" },
    date_time: { kind: "datetime", minDate: "2020-01-01", maxDate: "2030-12-31", timeFormat: "24h", timeStep: 15 },
    choice: {
      display: "dropdown", layout: "vertical", options: choiceOptions(),
      allowOther: true, otherLabel: "Something else", randomizeOrder: true,
    },
    email: { allowMultiple: true, maxEmails: 3, restrictDomains: ["example.com"], placeholder: "you@example.com" },
    number: {
      mode: "number", validation: { min: 0, max: 1000, step: 5, precision: 2 },
      thousandsSeparator: true, formatOnInput: true, prefix: "#", suffix: "pts",
    },
    scale: { min: 1, max: 10, step: 1, display: "stars", showValue: true, minLabel: "Poor", maxLabel: "Great" },
    website: {
      requireProtocol: true, allowedProtocols: ["https"],
      restrictDomains: ["example.com"], placeholder: "https://example.com",
    },
    address: { country: "US", fields: ["street", "city", "state", "zip"], requireAll: true },
    multi_field: {
      layout: "first_last",
      fields: [
        { key: "first", label: "First", type: "text", required: true },
        { key: "last", label: "Last", type: "text", required: true },
      ],
      storeAs: "separate",
    },
    display: { markdown: "## Please review before continuing" },
    file_upload: { maxSize: 5242880, allowedTypes: [".pdf", ".docx"], maxFiles: 3, previewThumbnails: true },
    js_question: {
      display: "visible", code: "emit(a + b);", inputKeys: ["a", "b"], outputKey: "sum",
      timeoutMs: 2000, helpText: "Computes a+b",
    },
    computed: { formula: "a + b", inputKeys: ["a", "b"] },
    final_documents: {
      markdownHeader: "## Your documents",
      outputFormats: ["pdf"],
      documents: [{
        id: randomUUID(),
        documentId: templateId,
        alias: "contract",
        // LU-5: conditions is a ConditionExpression -- prove it survives
        // export/import as-is, not just the mapping/alias fields.
        conditions: {
          type: "group",
          id: "g1",
          operator: "AND",
          conditions: [
            { type: "condition", id: "c1", variable: "tier", operator: "equals", value: "vip", valueType: "constant" },
          ],
        },
      }],
    },
    signature_block: {
      signerRole: "Applicant",
      routingOrder: 1,
      documents: [{ id: randomUUID(), documentId: templateId }],
      provider: "native",
      expiresInDays: 14,
      allowDecline: true,
    },
    // Deliberately the richest fixture in the file: four distinct question
    // types, one carrying visibleIf, and a nested kind:"list" field with its
    // own question (AC 2). A List is the only step whose config is itself a
    // tree, so it is the only one where a shallow copy would still look right.
    list: {
      minItems: 1,
      maxItems: 25,
      labelTemplate: "{full_name}",
      addButtonText: "Add beneficiary",
      allowReorder: true,
      emptyStateText: "No beneficiaries yet",
      fields: [
        {
          kind: "question", id: randomUUID(), alias: "full_name", type: "text",
          title: "Full name", order: 0, required: true,
          config: { variant: "short", validation: { maxLength: 120 } },
        },
        {
          kind: "question", id: randomUUID(), alias: "dob", type: "date_time",
          title: "Date of birth", order: 1,
          config: { kind: "date", maxDate: "2026-01-01" },
        },
        {
          kind: "question", id: randomUUID(), alias: "share", type: "number",
          title: "Share %", order: 2,
          config: { mode: "number", validation: { min: 0, max: 100 } },
        },
        {
          kind: "question", id: randomUUID(), alias: "is_minor", type: "choice",
          title: "Is a minor?", order: 3,
          config: { display: "radio", options: choiceOptions() },
          // A per-field condition is part of the config tree and must survive.
          visibleIf: {
            type: "group",
            id: "vis-1",
            operator: "AND",
            conditions: [
              { type: "condition", id: "vis-1-c1", variable: "full_name", operator: "is_not_empty", valueType: "constant" },
            ],
          },
        },
        {
          kind: "list", id: randomUUID(), alias: "addresses",
          title: "Addresses", order: 4,
          list: {
            minItems: 0,
            labelTemplate: "{street}",
            fields: [
              {
                kind: "question", id: randomUUID(), alias: "street", type: "text",
                title: "Street", order: 0, config: { variant: "short", validation: { maxLength: 200 } },
              },
            ],
          },
        },
      ],
    },
  };
}

/**
 * Replace every UUID with a stable placeholder.
 *
 * Ids are *expected* to change — that is what a clone does — so comparing them
 * would only re-test the remap that IEX3-2's suite already pins. Normalising
 * them leaves this test asserting the thing it is for: that every other key,
 * value, and level of nesting survived the round trip intact.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeIds(value: unknown): unknown {
  if (typeof value === "string") {
    return UUID_RE.test(value) ? "<uuid>" : value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeIds);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeIds(v);
    }
    return out;
  }
  return value;
}

describe.sequential("Portability round-trip fidelity across canonical step types (STB-18)", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let authToken: string;
  let tenantId: string;
  let userId: string;
  let projectId: string;
  let workflowId: string;
  let stepConfigs: Record<CanonicalStepType, Record<string, unknown>>;
  /** Aliases actually seeded, so the round-trip cannot pass by comparing nothing. */
  const seededAliases: string[] = [];

  // A second tenant, wholly unrelated to the fixture above, for the
  // cross-tenant denial cases (ticket's vertical proof).
  let otherTenantId: string;
  let otherAuthToken: string;
  let otherProjectId: string;

  async function downloadBundle(scope: string, id: string, token: string = authToken): Promise<{ status: number; body: Buffer }> {
    const response = await request(baseURL)
      .get(`/api/portability/export/${scope}/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    return { status: response.status, body: response.body as Buffer };
  }

  /** alias -> normalised config, for every step of a workflow. */
  async function configsByAlias(ofWorkflowId: string): Promise<Record<string, unknown>> {
    const rows = await getOwnerDb().select().from(schema.steps)
      .where(eq(schema.steps.workflowId, ofWorkflowId));
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      out[row.alias ?? row.id] = normalizeIds(row.config);
    }
    return out;
  }

  /** Every `type` value carried by a bundle's `entities/steps.jsonl`. */
  function stepTypesInBundle(bundle: Buffer): string[] {
    const zip = new AdmZip(bundle);
    const entry = zip.getEntry("entities/steps.jsonl");
    if (entry === null) { return []; }
    return entry.getData().toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as { type: string }).type);
  }

  /**
   * Build a one-step, one-page workflow under the main project/tenant whose
   * step config is deliberately NOT canonical, export it, and return the raw
   * bundle bytes plus the SOURCE workflow id — the "legacy/unknown bundle"
   * half of AC 3. The source id lets callers prove no *new* copy of the
   * marker-titled step exists after a rejected import, distinct from the
   * one legitimately seeded here to build the bundle in the first place.
   */
  async function seedInvalidBundle(
    opts: { stepType: (typeof schema.stepTypeEnum.enumValues)[number]; stepConfig: unknown; markerTitle: string }
  ): Promise<{ bundle: Buffer; sourceWorkflowId: string }> {
    const [workflow] = await getOwnerDb().insert(schema.workflows).values({
      title: `Invalid Bundle Source ${randomUUID().slice(0, 8)}`,
      name: "Invalid Bundle Source",
      projectId, creatorId: userId, ownerId: userId,
      ownerType: "user", ownerUuid: userId,
    }).returning();

    const [page] = await getOwnerDb().insert(schema.pages).values({
      workflowId: workflow.id, title: "Page", order: 0,
    }).returning();

    await getOwnerDb().insert(schema.steps).values({
      workflowId: workflow.id,
      pageId: page.id,
      type: opts.stepType,
      title: opts.markerTitle,
      alias: `alias_${randomUUID().slice(0, 8)}`,
      order: 0,
      config: opts.stepConfig,
    });

    const { status, body } = await downloadBundle("workflow", workflow.id);
    expect(status).toBe(200);
    return { bundle: body, sourceWorkflowId: workflow.id };
  }

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    // RLS-2d: mounted BEFORE registerRoutes, mirroring server/index.ts /
    // server/production.ts — see the note in portability.export.test.ts.
    app.use(rlsContext);
    server = await registerRoutes(app);
    const port = await new Promise<number>((resolve) => {
      const s = server.listen(0, () => {
        const addr = s.address();
        resolve(typeof addr === "object" && addr ? addr.port : 5031);
      });
    });
    baseURL = `http://localhost:${port}`;

    const [tenant] = await getOwnerDb().insert(schema.tenants).values({
      name: "Round-trip Fidelity Tenant", plan: "free",
    }).returning();
    tenantId = tenant.id;

    const registerResponse = await request(baseURL)
      .post("/api/auth/register")
      .send({
        email: `roundtrip-${nanoid()}@example.com`,
        password: "TestPassword123!@#Strong",
        firstName: "Round", lastName: "Trip",
      })
      .expect(201);
    authToken = registerResponse.body.token;
    userId = registerResponse.body.user.id;
    await getOwnerDb().update(schema.users)
      .set({ tenantId, tenantRole: "owner" })
      .where(eq(schema.users.id, userId));

    const projectResponse = await request(baseURL)
      .post("/api/projects")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: `Round-trip Project ${nanoid()}` })
      .expect(201);
    projectId = projectResponse.body.id;

    const [workflow] = await getOwnerDb().insert(schema.workflows).values({
      title: `Round-trip Workflow ${nanoid()}`,
      name: "Round-trip Workflow",
      projectId, creatorId: userId, ownerId: userId,
      ownerType: "user", ownerUuid: userId,
    }).returning();
    workflowId = workflow.id;

    const [page] = await getOwnerDb().insert(schema.pages).values({
      workflowId, title: "Everything", order: 0,
    }).returning();

    // A real template, attached to the workflow, so the document-bearing step
    // types reference something that legitimately travels in both scopes.
    const template = await seedTemplate({
      projectId, userId, attachToWorkflowId: workflowId, name: "Round-trip Letter",
    });

    stepConfigs = buildStepConfigs(template.templateId);

    let order = 0;
    for (const type of CANONICAL_STEP_TYPES) {
      const alias = `alias_${type}`;
      await getOwnerDb().insert(schema.steps).values({
        workflowId,
        pageId: page.id,
        type,
        title: `Step ${type}`,
        alias,
        order: order++,
        config: stepConfigs[type],
      });
      seededAliases.push(alias);
    }

    // A wholly separate tenant/user/project for the cross-tenant denial cases.
    const [otherTenant] = await getOwnerDb().insert(schema.tenants).values({
      name: "Round-trip Outsider Tenant", plan: "free",
    }).returning();
    otherTenantId = otherTenant.id;

    const otherRegisterResponse = await request(baseURL)
      .post("/api/auth/register")
      .send({
        email: `roundtrip-outsider-${nanoid()}@example.com`,
        password: "TestPassword123!@#Strong",
        firstName: "Out", lastName: "Sider",
      })
      .expect(201);
    otherAuthToken = otherRegisterResponse.body.token;
    const otherUserId = otherRegisterResponse.body.user.id;
    await getOwnerDb().update(schema.users)
      .set({ tenantId: otherTenantId, tenantRole: "owner" })
      .where(eq(schema.users.id, otherUserId));

    const otherProjectResponse = await request(baseURL)
      .post("/api/projects")
      .set("Authorization", `Bearer ${otherAuthToken}`)
      .send({ name: `Outsider Project ${nanoid()}` })
      .expect(201);
    otherProjectId = otherProjectResponse.body.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await getOwnerDb().delete(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenantId));
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    }
    if (otherTenantId) {
      await getOwnerDb().delete(schema.auditLogs).where(eq(schema.auditLogs.tenantId, otherTenantId));
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
    }
    if (server) {
      await new Promise<void>((resolve) => { server.close(() => resolve()); });
    }
  });

  it("AC 1: every canonical step type has a fixture, and every fixture is itself canonically valid", () => {
    const configs = buildStepConfigs(randomUUID());

    const uncovered = CANONICAL_STEP_TYPES.filter((type) => !(type in configs));
    expect(
      uncovered,
      `These canonical step types have no portability fixture, so a round trip ` +
      `has never been proven for them. Add a config to buildStepConfigs() in this file.`
    ).toEqual([]);

    // The fixture is not just present -- it must actually pass the same
    // write-boundary validator ImportService now enforces (STB-17's
    // validateCanonicalStepConfig). This is what makes "no retired aliases or
    // removed keys" a proven property of this suite rather than an assertion.
    for (const type of CANONICAL_STEP_TYPES) {
      const result = validateCanonicalStepConfig(type, configs[type]);
      expect(
        result.success,
        `Fixture for "${type}" is not canonically valid: ${JSON.stringify(result.error?.issues)}`
      ).toBe(true);
    }
  });

  it("AC 2: the List fixture covers four question types, a visibleIf and a nested list", () => {
    const list = buildStepConfigs(randomUUID()).list as {
      fields: Array<Record<string, unknown>>;
    };

    const questionFields = list.fields.filter((f) => f.kind === "question");
    const questionTypes = new Set(questionFields.map((f) => f.type as string));
    expect(questionTypes.size).toBeGreaterThanOrEqual(4);

    // Every question type used must actually be legal inside a List, or the
    // fixture is asserting something the builder would never produce.
    for (const type of questionTypes) {
      expect(
        LIST_FIELD_QUESTION_TYPES as readonly string[],
        `${type} is used in the List fixture but is not a valid list field type`
      ).toContain(type);
    }

    expect(questionFields.some((f) => f.visibleIf !== undefined)).toBe(true);

    const nested = list.fields.find((f) => f.kind === "list") as
      { list: { fields: Array<Record<string, unknown>> } } | undefined;
    expect(nested).toBeDefined();
    expect(nested!.list.fields.length).toBeGreaterThan(0);
    expect(nested!.list.fields[0].kind).toBe("question");
  });

  it("AC 2: every canonical step config survives a project-scope round trip byte-for-byte", async () => {
    const { status, body: bundle } = await downloadBundle("project", projectId);
    expect(status).toBe(200);

    const applied = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", bundle, "project.ezb")
      .expect(201);

    const [importedWorkflow] = await getOwnerDb().select().from(schema.workflows)
      .where(eq(schema.workflows.projectId, applied.body.rootId));
    expect(importedWorkflow).toBeDefined();

    const before = await configsByAlias(workflowId);
    const after = await configsByAlias(importedWorkflow.id);

    // Without this, two empty maps would satisfy the deep-equal below and the
    // test would pass having compared nothing.
    expect(Object.keys(before).sort()).toEqual([...seededAliases].sort());

    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect(after).toEqual(before);
  });

  it("AC 2: every canonical step config survives a workflow-scope round trip byte-for-byte", async () => {
    const { status, body: bundle } = await downloadBundle("workflow", workflowId);
    expect(status).toBe(200);

    const applied = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", bundle, "workflow.ezb")
      .expect(201);

    const before = await configsByAlias(workflowId);
    const after = await configsByAlias(applied.body.rootId);

    // Without this, two empty maps would satisfy the deep-equal below and the
    // test would pass having compared nothing.
    expect(Object.keys(before).sort()).toEqual([...seededAliases].sort());

    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect(after).toEqual(before);
  });

  it("AC 3: export emits canonical types only", async () => {
    const { status, body: projectBundle } = await downloadBundle("project", projectId);
    expect(status).toBe(200);
    const projectTypes = stepTypesInBundle(projectBundle);
    expect(projectTypes.length).toBeGreaterThan(0);
    for (const type of projectTypes) {
      expect(CANONICAL_STEP_TYPES as readonly string[], `"${type}" is not a canonical step type`).toContain(type);
    }

    const { status: wfStatus, body: workflowBundle } = await downloadBundle("workflow", workflowId);
    expect(wfStatus).toBe(200);
    const workflowTypes = stepTypesInBundle(workflowBundle);
    expect(workflowTypes.length).toBeGreaterThan(0);
    for (const type of workflowTypes) {
      expect(CANONICAL_STEP_TYPES as readonly string[], `"${type}" is not a canonical step type`).toContain(type);
    }
  });

  it("AC 3: a bundle carrying a retired step type is rejected before any row is written", async () => {
    const markerTitle = `Retired Type Marker ${randomUUID()}`;
    const { bundle, sourceWorkflowId } = await seedInvalidBundle({
      stepType: "short_text",
      stepConfig: { placeholder: "legacy" },
      markerTitle,
    });

    // Dedicated, empty target project so "zero rows written" is unambiguous.
    const targetProjectResponse = await request(baseURL)
      .post("/api/projects")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: `Rejected Import Target ${nanoid()}` })
      .expect(201);
    const targetProjectId = targetProjectResponse.body.id;

    const preview = await request(baseURL)
      .post("/api/portability/import/preview")
      .set("Authorization", `Bearer ${authToken}`)
      .field("targetProjectId", targetProjectId)
      .attach("file", bundle, "legacy.ezb")
      .expect(200);
    expect(preview.body.canProceed).toBe(false);
    expect(preview.body.errors.join(" ")).toMatch(/retired|not canonical/i);

    const beforeWorkflows = await getOwnerDb().select().from(schema.workflows)
      .where(eq(schema.workflows.projectId, targetProjectId));
    expect(beforeWorkflows).toHaveLength(0);

    await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .field("targetProjectId", targetProjectId)
      .attach("file", bundle, "legacy.ezb")
      .expect(400);

    // The actual proof: query the table, don't trust the status code alone.
    const afterWorkflows = await getOwnerDb().select().from(schema.workflows)
      .where(eq(schema.workflows.projectId, targetProjectId));
    expect(afterWorkflows).toHaveLength(0);

    // A stronger, table-level proof than the project scope above: no NEW
    // step carrying this marker title exists anywhere, only the one
    // legitimately seeded to build the bundle in the first place.
    const stray = await getOwnerDb().select().from(schema.steps)
      .where(and(eq(schema.steps.title, markerTitle), ne(schema.steps.workflowId, sourceWorkflowId)));
    expect(stray).toHaveLength(0);
  });

  it("AC 3: a bundle carrying an unknown config key on a canonical type is rejected before any row is written", async () => {
    const markerTitle = `Unknown Key Marker ${randomUUID()}`;
    // A real defect this initiative found: `decimalPlaces` was never a
    // legal key on any canonical `number` config, only ever advertised by
    // schema membership (STB-1).
    const { bundle, sourceWorkflowId } = await seedInvalidBundle({
      stepType: "number",
      stepConfig: { mode: "number", validation: {}, decimalPlaces: 3 },
      markerTitle,
    });

    const targetProjectResponse = await request(baseURL)
      .post("/api/projects")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: `Rejected Import Target ${nanoid()}` })
      .expect(201);
    const targetProjectId = targetProjectResponse.body.id;

    const preview = await request(baseURL)
      .post("/api/portability/import/preview")
      .set("Authorization", `Bearer ${authToken}`)
      .field("targetProjectId", targetProjectId)
      .attach("file", bundle, "unknown-key.ezb")
      .expect(200);
    expect(preview.body.canProceed).toBe(false);
    expect(preview.body.errors.join(" ")).toMatch(/decimalPlaces/);

    await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .field("targetProjectId", targetProjectId)
      .attach("file", bundle, "unknown-key.ezb")
      .expect(400);

    const afterWorkflows = await getOwnerDb().select().from(schema.workflows)
      .where(eq(schema.workflows.projectId, targetProjectId));
    expect(afterWorkflows).toHaveLength(0);

    const stray = await getOwnerDb().select().from(schema.steps)
      .where(and(eq(schema.steps.title, markerTitle), ne(schema.steps.workflowId, sourceWorkflowId)));
    expect(stray).toHaveLength(0);
  });

  it("cross-tenant denial: a caller cannot export another tenant's workflow", async () => {
    const response = await request(baseURL)
      .get(`/api/portability/export/workflow/${workflowId}`)
      .set("Authorization", `Bearer ${otherAuthToken}`);
    expect([403, 404]).toContain(response.status);
  });

  it("cross-tenant denial: a caller cannot import into a project they cannot access", async () => {
    const { status, body: bundle } = await downloadBundle("workflow", workflowId);
    expect(status).toBe(200);

    const beforeWorkflows = await getOwnerDb().select().from(schema.workflows)
      .where(eq(schema.workflows.projectId, otherProjectId));

    const response = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .field("targetProjectId", otherProjectId)
      .attach("file", bundle, "workflow.ezb");
    expect([403, 404]).toContain(response.status);

    const afterWorkflows = await getOwnerDb().select().from(schema.workflows)
      .where(eq(schema.workflows.projectId, otherProjectId));
    expect(afterWorkflows).toHaveLength(beforeWorkflows.length);
  });
});
