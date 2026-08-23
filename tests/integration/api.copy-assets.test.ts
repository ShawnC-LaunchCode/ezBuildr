import { randomUUID } from "crypto";

import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@shared/schema";

import { createTestUser, setupIntegrationTest, type IntegrationTestContext } from "../helpers/integrationTestHelper";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe.sequential("Asset Copy API Integration Tests", () => {
  let ctx: IntegrationTestContext;
  let member: Awaited<ReturnType<typeof createTestUser>>;
  let sourceProjectId: string;
  let sourceWorkflowId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: "Test Tenant for Asset Copy",
      userRole: "admin",
      tenantRole: "owner",
    });
    member = await createTestUser(ctx, "builder");
    await getOwnerDb().insert(schema.organizationMemberships).values({
      orgId: ctx.orgId,
      userId: member.userId,
      role: "member",
    });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  beforeEach(async () => {
    const sourceProject = await createOrgProjectWithWorkflow(member.userId);
    sourceProjectId = sourceProject.projectId;
    sourceWorkflowId = sourceProject.workflowId;
  });

  it("allows an org member to copy an org project to their personal account with related table data", async () => {
    const response = await request(ctx.baseURL)
      .post(`/api/projects/${sourceProjectId}/copy`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({
        includeRelatedDatavault: true,
        includeDatavaultData: true,
        clearAccess: true,
      })
      .expect(201);

    expect(response.body.data.project.ownerType).toBe("user");
    expect(response.body.data.project.ownerUuid).toBe(member.userId);
    expect(response.body.data.project.title).toMatch(/^dev_/);
    expect(response.body.data.workflows).toHaveLength(1);
    expect(response.body.data.copiedTables).toBe(1);
    expect(response.body.data.copiedRows).toBe(1);

    const copiedWorkflowId = response.body.data.workflows[0].id as string;
    const copiedPages = await getOwnerDb()
      .select()
      .from(schema.pages)
      .where(eq(schema.pages.workflowId, copiedWorkflowId));
    expect(copiedPages).toHaveLength(1);

    const copiedTables = await getOwnerDb()
      .select()
      .from(schema.datavaultTables)
      .where(eq(schema.datavaultTables.ownerUuid, member.userId));
    expect(copiedTables.some((table) => table.name.startsWith("dev_"))).toBe(true);
  });

  it("allows an org member to copy one workflow to their personal account", async () => {
    const response = await request(ctx.baseURL)
      .post(`/api/workflows/${sourceWorkflowId}/copy`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({
        includeRelatedDatavault: false,
        clearAccess: true,
      })
      .expect(201);

    expect(response.body.data.workflow.ownerType).toBe("user");
    expect(response.body.data.workflow.ownerUuid).toBe(member.userId);
    expect(response.body.data.workflow.projectId).toBeNull();
    expect(response.body.data.workflow.title).toMatch(/^dev_/);
    expect(response.body.data.workflow.settings).toEqual({
      branding: { primaryColor: "#123456" },
      behavior: { showProgressBar: false },
    });
  });

  it("rejects transferring an org project out when the requester is not an org admin", async () => {
    const response = await request(ctx.baseURL)
      .post(`/api/projects/${sourceProjectId}/transfer`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({
        targetOwnerType: "user",
        targetOwnerUuid: member.userId,
      });

    expect(response.status).toBe(403);
    expect(response.body.error ?? response.body.message).toContain("Organization admin");
  });

  async function createOrgProjectWithWorkflow(userId: string): Promise<{ projectId: string; workflowId: string }> {
    const [project] = await getOwnerDb()
      .insert(schema.projects)
      .values({
        id: randomUUID(),
        title: "Production Intake",
        name: "Production Intake",
        tenantId: ctx.tenantId,
        creatorId: userId,
        createdBy: userId,
        ownerId: userId,
        ownerType: "org",
        ownerUuid: ctx.orgId,
        status: "active",
        archived: false,
      })
      .returning();

    const [workflow] = await getOwnerDb()
      .insert(schema.workflows)
      .values({
        id: randomUUID(),
        projectId: project.id,
        title: "Production Workflow",
        name: "Production Workflow",
        creatorId: userId,
        ownerId: userId,
        ownerType: "org",
        ownerUuid: ctx.orgId,
        status: "active",
        isPublic: false,
        requireLogin: false,
        intakeConfig: {},
        settings: {
          branding: { primaryColor: "#123456" },
          behavior: { showProgressBar: false },
        },
      })
      .returning();

    await getOwnerDb().insert(schema.workflowVersions).values({
      id: randomUUID(),
      workflowId: workflow.id,
      versionNumber: 1,
      isDraft: false,
      graphJson: {},
      createdBy: userId,
      published: true,
    });

    const [page] = await getOwnerDb()
      .insert(schema.pages)
      .values({
        id: randomUUID(),
        workflowId: workflow.id,
        title: "Applicant",
        order: 1,
      })
      .returning();

    await getOwnerDb().insert(schema.steps).values({
      id: randomUUID(),
      workflowId: workflow.id,
      pageId: page.id,
      type: "short_text",
      title: "Name",
      alias: "name",
      order: 1,
    });

    const [database] = await getOwnerDb()
      .insert(schema.datavaultDatabases)
      .values({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        name: "Production Database",
        scopeType: "project",
        scopeId: project.id,
        ownerType: "org",
        ownerUuid: ctx.orgId,
      })
      .returning();

    const [table] = await getOwnerDb()
      .insert(schema.datavaultTables)
      .values({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        ownerUserId: userId,
        databaseId: database.id,
        name: "Applicants",
        slug: `applicants-${randomUUID()}`,
        ownerType: "org",
        ownerUuid: ctx.orgId,
      })
      .returning();

    const [column] = await getOwnerDb()
      .insert(schema.datavaultColumns)
      .values({
        id: randomUUID(),
        tableId: table.id,
        name: "Name",
        slug: "name",
        type: "text",
        orderIndex: 1,
      })
      .returning();

    const [row] = await getOwnerDb()
      .insert(schema.datavaultRows)
      .values({
        id: randomUUID(),
        tableId: table.id,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await getOwnerDb().insert(schema.datavaultValues).values({
      id: randomUUID(),
      rowId: row.id,
      columnId: column.id,
      value: "Ada Lovelace",
    });

    await getOwnerDb().insert(schema.workflowDataSources).values({
      workflowId: workflow.id,
      dataSourceId: database.id,
    });

    return { projectId: project.id, workflowId: workflow.id };
  }
});
