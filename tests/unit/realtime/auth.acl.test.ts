import type { IncomingMessage } from "http";

import { describe, it, expect, beforeEach, vi, type Mock, type Mocked } from "vitest";

import { authenticateConnection } from "../../../server/realtime/auth";
import { workflowAccessRepository, teamMemberRepository, workflowRepository } from "../../../server/repositories";
import { authService } from "../../../server/services/AuthService";

import { createTestWorkflow } from "../../factories/workflowFactory";

import type { Workflow, WorkflowAccess } from "../../../shared/schema";

/**
 * MAP-B5 (deep proof) — `auth.test.ts` proves `authenticateConnection`
 * correctly delegates to and propagates `workflowService.verifyAccess`, with
 * that call mocked at the boundary (the same convention `SectionService.test.ts`
 * and `WorkflowService.test.ts` use for their own dependencies). This file
 * goes one layer deeper: it does **not** mock `workflowService` or
 * `aclService` at all, only the repositories underneath them, so the actual
 * `edit` vs `view` vs `none` role precedence in `AclService.hasWorkflowRole`
 * runs for real. This is what actually proves a view-only grant and a
 * missing grant are both rejected — not just that a mocked rejection
 * propagates.
 */

// RLS-2e: `WorkflowService.verifyAccess` now opens a tenant-scoped
// transaction via `withCurrentTenant`/`withTenant`, which calls
// `applyTenantToTransaction(tx, tenantId)` — a `tx.execute(...)` call that
// sets the `app.current_tenant_id` GUC. The stub `tx` needs a no-op
// `execute` for that call to succeed; its return value is never read.
vi.mock("../../../server/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ execute: vi.fn().mockResolvedValue(undefined) })
    ),
  },
}));

vi.mock("../../../server/services/AuthService", () => ({
  authService: {
    verifyToken: vi.fn(),
  },
}));

vi.mock("../../../server/repositories", () => ({
  workflowRepository: {
    findByIdOrSlug: vi.fn(),
    findById: vi.fn(),
  },
  workflowAccessRepository: {
    findByWorkflowAndUser: vi.fn(),
    findByWorkflowAndTeams: vi.fn(),
  },
  teamMemberRepository: {
    findByUserId: vi.fn(),
  },
  // AclService's constructor also defaults to these two — mocked so the real
  // repositories module (and its DB import) is never reached, even though
  // the 'user'-owned, project-less fixture below never exercises them.
  projectAccessRepository: {
    findByProjectAndUser: vi.fn(),
    findByProjectAndTeams: vi.fn(),
  },
  projectRepository: {
    findById: vi.fn(),
  },
  // WorkflowService's constructor destructures these too, even though
  // `verifyAccess` (the only method this file exercises) never calls them.
  // Vitest 4 throws if a named import has no matching mock export at all,
  // so every sibling on the real barrel needs a stub here.
  sectionRepository: {},
  stepRepository: {},
  logicRuleRepository: {},
  userRepository: {},
}));

function makeRequest(): IncomingMessage {
  return {
    headers: { authorization: "Bearer test-token", host: "localhost" },
    url: "/collab",
  } as unknown as IncomingMessage;
}

const WORKFLOW_ID = "workflow-1";
const ROOM_KEY = `tenant:tenant-1:workflow:${WORKFLOW_ID}`;

function tokenFor(userId: string): {
  userId: string;
  email: string;
  tenantId: string;
  role: "creator";
  tenantRole: "builder";
} {
  return {
    userId,
    email: `${userId}@example.com`,
    tenantId: "tenant-1",
    role: "creator",
    tenantRole: "builder",
  };
}

describe("authenticateConnection — real ACL resolution (MAP-B5)", () => {
  const mockVerifyToken = authService.verifyToken as unknown as Mock;
  const mockWorkflowRepo = workflowRepository as Mocked<typeof workflowRepository>;
  const mockWorkflowAccessRepo = workflowAccessRepository as Mocked<typeof workflowAccessRepository>;
  const mockTeamMemberRepo = teamMemberRepository as Mocked<typeof teamMemberRepository>;

  const workflow = createTestWorkflow({
    id: WORKFLOW_ID,
    ownerId: "creator-1",
    creatorId: "creator-1",
    ownerType: "user",
    ownerUuid: "creator-1",
    projectId: null,
  }) as unknown as Workflow;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
    mockWorkflowRepo.findById.mockResolvedValue(workflow);
    mockTeamMemberRepo.findByUserId.mockResolvedValue([]);
    mockWorkflowAccessRepo.findByWorkflowAndUser.mockResolvedValue(undefined);
    mockWorkflowAccessRepo.findByWorkflowAndTeams.mockResolvedValue([]);
  });

  it("admits the workflow's creator (owner via ownership, satisfies 'edit')", async () => {
    mockVerifyToken.mockReturnValue(tokenFor("creator-1"));

    const user = await authenticateConnection(makeRequest(), ROOM_KEY);

    expect(user.userId).toBe("creator-1");
  });

  it("admits a non-creator granted 'edit' through workflow_access", async () => {
    mockVerifyToken.mockReturnValue(tokenFor("editor-2"));
    mockWorkflowAccessRepo.findByWorkflowAndUser.mockResolvedValue(
      { role: "edit" } as unknown as WorkflowAccess
    );

    const user = await authenticateConnection(makeRequest(), ROOM_KEY);

    expect(user.userId).toBe("editor-2");
  });

  it("rejects a non-creator granted only 'view' through workflow_access — collab implies edit", async () => {
    mockVerifyToken.mockReturnValue(tokenFor("viewer-3"));
    mockWorkflowAccessRepo.findByWorkflowAndUser.mockResolvedValue(
      { role: "view" } as unknown as WorkflowAccess
    );

    await expect(authenticateConnection(makeRequest(), ROOM_KEY)).rejects.toThrow(/Access denied/);
  });

  it("rejects a user with no workflow_access grant, no ownership, and no team role at all", async () => {
    mockVerifyToken.mockReturnValue(tokenFor("stranger-4"));
    mockWorkflowAccessRepo.findByWorkflowAndUser.mockResolvedValue(undefined);
    mockTeamMemberRepo.findByUserId.mockResolvedValue([]);

    await expect(authenticateConnection(makeRequest(), ROOM_KEY)).rejects.toThrow(/Access denied/);
  });
});
