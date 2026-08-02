import { randomUUID } from "crypto";
import { type Server } from "http";
import { eq } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import * as schema from "@shared/schema";
import { stepTypeEnum } from "@shared/schema";
import { LIST_FIELD_QUESTION_TYPES } from "@shared/types/stepConfigs";
import { db } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { seedTemplate } from "../helpers/bundleTestHelper";

/**
 * IEX3-3 — portability fidelity across every step type.
 *
 * Before this file, the portability suites proved that one `text` step
 * survived a project-scope round trip. Both live defects fixed in IEX3-1 and
 * IEX3-2 sat undetected behind that gap, which is the argument for covering
 * the whole enum rather than the types that happen to look risky.
 *
 * The fixture is derived from `stepTypeEnum` itself and the test fails if a
 * new value appears that is neither covered nor explicitly skipped — the same
 * discipline `LIST_FIELD_QUESTION_TYPES` uses, and for the same reason: a
 * hand-maintained list went stale and that is what retired `RepeaterFieldType`
 * (LIST-13). Adding a step type should force a decision about portability.
 */

/**
 * Step types deliberately not exercised, each with the reason. Empty on
 * purpose: every current type can hold a config and round-trip, so there is
 * nothing legitimate to skip. An entry here is a claim that portability does
 * not apply to that type, and needs to say why.
 */
const SKIPPED: Record<string, string> = {};

/** A distinctive config per step type, so a dropped or coerced key is visible. */
function buildStepConfigs(templateId: string): Record<string, Record<string, unknown>> {
  const choiceOptions = [
    { id: randomUUID(), label: "Yes", value: "yes" },
    { id: randomUUID(), label: "No", value: "no" },
  ];

  return {
    // ===== LEGACY =====
    short_text: { placeholder: "Legacy short", maxLength: 40 },
    long_text: { placeholder: "Legacy long", rows: 5 },
    multiple_choice: { options: choiceOptions, allowMultiple: true },
    radio: { options: choiceOptions },
    yes_no: { trueLabel: "Affirmative", falseLabel: "Negative" },
    date_time: { includeTime: true, timezone: "America/Chicago" },
    file_upload: { maxSize: 1048576, allowedTypes: [".pdf", ".docx"] },
    computed: { formula: "a + b", inputKeys: ["a", "b"] },
    js_question: { code: "emit(1 + 1);", timeoutMs: 500 },
    final_documents: {
      markdownHeader: "## Your documents",
      documents: [{ id: randomUUID(), documentId: templateId, alias: "contract" }],
    },
    signature_block: {
      signerRole: "Applicant",
      routingOrder: 1,
      documents: [{ id: randomUUID(), documentId: templateId }],
      provider: "native",
      expiresInDays: 14,
    },

    // ===== EASY MODE =====
    true_false: { trueLabel: "On", falseLabel: "Off" },
    phone: { format: "US", placeholder: "(555) 555-5555" },
    date: { minDate: "2020-01-01", maxDate: "2030-12-31" },
    time: { step: 15 },
    datetime: { includeSeconds: false },
    email: { placeholder: "you@example.com" },
    number: { min: 0, max: 100, step: 5 },
    currency: { currency: "USD", precision: 2 },
    scale: { min: 1, max: 10, minLabel: "Poor", maxLabel: "Great" },
    website: { requireHttps: true },
    display: { markdown: "### Read this first" },
    address: { requireCountry: true, defaultCountry: "US" },
    final: { markdownHeader: "All done", documents: [] },

    // ===== ADVANCED MODE =====
    text: { multiline: false, maxLength: 255, placeholder: "Advanced text" },
    boolean: { display: "switch", trueLabel: "Enabled" },
    phone_advanced: { format: "E164", allowExtension: true },
    datetime_unified: { mode: "datetime", timezone: "UTC" },
    choice: {
      display: "dropdown",
      allowMultiple: false,
      options: choiceOptions,
      allowOther: true,
      otherLabel: "Something else",
    },
    email_advanced: { allowedDomains: ["example.com"], confirmField: true },
    number_advanced: { min: -50, max: 50, decimalPlaces: 3, thousandsSeparator: true },
    scale_advanced: { min: 0, max: 5, step: 0.5, showValue: true },
    website_advanced: { requireHttps: false, allowedSchemes: ["http", "https"] },
    address_advanced: { components: ["line1", "city", "postalCode"], autocomplete: true },
    multi_field: {
      fields: [
        { id: randomUUID(), alias: "first", label: "First", type: "text", order: 0 },
        { id: randomUUID(), alias: "last", label: "Last", type: "text", order: 1 },
      ],
    },
    display_advanced: { markdown: "## Advanced display", showBorder: true },

    // ===== STRUCTURAL =====
    // Deliberately the richest fixture in the file: four distinct question
    // types, one carrying visibleIf, and a nested kind:"list" field with its
    // own question (AC 3). A List is the only step whose config is itself a
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
          config: { maxLength: 120 },
        },
        {
          kind: "question", id: randomUUID(), alias: "dob", type: "date",
          title: "Date of birth", order: 1,
          config: { maxDate: "2026-01-01" },
        },
        {
          kind: "question", id: randomUUID(), alias: "share", type: "number",
          title: "Share %", order: 2,
          config: { min: 0, max: 100 },
        },
        {
          kind: "question", id: randomUUID(), alias: "is_minor", type: "choice",
          title: "Is a minor?", order: 3,
          config: { display: "radio", allowMultiple: false, options: choiceOptions },
          // A per-field condition is part of the config tree and must survive.
          visibleIf: {
            type: "comparison",
            operator: "is_not_empty",
            left: { kind: "variable", name: "full_name" },
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
                title: "Street", order: 0, config: { maxLength: 200 },
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

describe.sequential("Portability round-trip fidelity across step types", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let authToken: string;
  let tenantId: string;
  let userId: string;
  let projectId: string;
  let workflowId: string;
  let stepConfigs: Record<string, Record<string, unknown>>;
  /** Aliases actually seeded, so the round-trip cannot pass by comparing nothing. */
  const seededAliases: string[] = [];

  async function downloadBundle(scope: string, id: string): Promise<Buffer> {
    const response = await request(baseURL)
      .get(`/api/portability/export/${scope}/${id}`)
      .set("Authorization", `Bearer ${authToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    return response.body as Buffer;
  }

  /** alias -> normalised config, for every step of a workflow. */
  async function configsByAlias(ofWorkflowId: string): Promise<Record<string, unknown>> {
    const rows = await db.select().from(schema.steps)
      .where(eq(schema.steps.workflowId, ofWorkflowId));
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      out[row.alias ?? row.id] = normalizeIds(row.config);
    }
    return out;
  }

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    server = await registerRoutes(app);
    const port = await new Promise<number>((resolve) => {
      const s = server.listen(0, () => {
        const addr = s.address();
        resolve(typeof addr === "object" && addr ? addr.port : 5031);
      });
    });
    baseURL = `http://localhost:${port}`;

    const [tenant] = await db.insert(schema.tenants).values({
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
    await db.update(schema.users)
      .set({ tenantId, tenantRole: "owner" })
      .where(eq(schema.users.id, userId));

    const projectResponse = await request(baseURL)
      .post("/api/projects")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: `Round-trip Project ${nanoid()}` })
      .expect(201);
    projectId = projectResponse.body.id;

    const [workflow] = await db.insert(schema.workflows).values({
      title: `Round-trip Workflow ${nanoid()}`,
      name: "Round-trip Workflow",
      projectId, creatorId: userId, ownerId: userId,
      ownerType: "user", ownerUuid: userId,
    }).returning();
    workflowId = workflow.id;

    const [section] = await db.insert(schema.sections).values({
      workflowId, title: "Everything", order: 0,
    }).returning();

    // A real template, attached to the workflow, so the document-bearing step
    // types reference something that legitimately travels in both scopes.
    const template = await seedTemplate({
      projectId, userId, attachToWorkflowId: workflowId, name: "Round-trip Letter",
    });

    stepConfigs = buildStepConfigs(template.templateId);

    // Iterate the *fixtures*, not the raw enum. A newly added enum value with
    // no fixture must be reported by the coverage test below, not crash this
    // setup on an enum the local database has not migrated yet — otherwise the
    // suite dies before it can say what is actually wrong.
    let order = 0;
    for (const type of stepTypeEnum.enumValues) {
      if (type in SKIPPED || !(type in stepConfigs)) {
        continue;
      }
      const alias = `alias_${type}`;
      await db.insert(schema.steps).values({
        workflowId,
        sectionId: section.id,
        type,
        title: `Step ${type}`,
        alias,
        order: order++,
        config: stepConfigs[type],
      });
      seededAliases.push(alias);
    }
  });

  afterAll(async () => {
    if (tenantId) {
      await db.delete(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenantId));
      await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    }
    if (server) {
      await new Promise<void>((resolve) => { server.close(() => resolve()); });
    }
  });

  it("AC 1 & 2: every stepTypeEnum value is covered by a fixture or explicitly skipped", () => {
    const configs = buildStepConfigs(randomUUID());
    const uncovered = stepTypeEnum.enumValues.filter(
      (type) => !(type in configs) && !(type in SKIPPED)
    );

    expect(
      uncovered,
      `These step types have no portability fixture and no entry in SKIPPED, so a ` +
      `round trip has never been proven for them. Add a config to buildStepConfigs() ` +
      `in this file, or add a SKIPPED entry saying why portability does not apply.`
    ).toEqual([]);
  });

  it("AC 3: the List fixture covers four question types, a visibleIf and a nested list", () => {
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

  it("AC 4: every step config survives a project-scope round trip byte-for-byte", async () => {
    const bundle = await downloadBundle("project", projectId);

    const applied = await request(baseURL)
      .post("/api/portability/import/apply")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", bundle, "project.ezb")
      .expect(201);

    const [importedWorkflow] = await db.select().from(schema.workflows)
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

  it("AC 5: every step config survives a workflow-scope round trip byte-for-byte", async () => {
    const bundle = await downloadBundle("workflow", workflowId);

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
});
