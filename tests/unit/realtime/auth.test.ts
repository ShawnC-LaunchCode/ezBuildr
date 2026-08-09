import type { IncomingMessage } from "http";

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

import { authenticateConnection } from "../../../server/realtime/auth";
import { authService } from "../../../server/services/AuthService";
import { workflowService } from "../../../server/services/WorkflowService";

/**
 * MAP-B5 — collaboration used to admit only `workflow.creatorId`, so a user
 * granted edit access through `workflow_access` could never join, and
 * presence could never show a second person. The fix reuses
 * `WorkflowService.verifyAccess` (the same 'edit' gate every other
 * section/step mutation already goes through) instead of a bespoke
 * creator-only check, mirroring how `SectionService.test.ts` and friends
 * mock `workflowService` rather than re-testing `AclService`'s own role
 * resolution underneath it.
 */

vi.mock("../../../server/services/AuthService", () => ({
  authService: {
    verifyToken: vi.fn(),
  },
}));

vi.mock("../../../server/services/WorkflowService", () => ({
  workflowService: {
    verifyAccess: vi.fn(),
  },
}));

function makeRequest(): IncomingMessage {
  return {
    headers: { authorization: "Bearer test-token", host: "localhost" },
    url: "/collab",
  } as unknown as IncomingMessage;
}

const ROOM_KEY = "tenant:tenant-1:workflow:workflow-1";

describe("authenticateConnection (MAP-B5)", () => {
  const mockVerifyToken = authService.verifyToken as unknown as Mock;
  const mockVerifyAccess = workflowService.verifyAccess as unknown as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyToken.mockReturnValue({
      userId: "user-1",
      email: "user@example.com",
      tenantId: "tenant-1",
      role: "creator",
      tenantRole: "builder",
    });
  });

  it("admits the workflow's creator", async () => {
    // The creator satisfies 'edit' through ownership inside verifyAccess's
    // own ACL resolution — nothing in auth.ts needs to know that directly
    // any more.
    mockVerifyAccess.mockResolvedValue({ id: "workflow-1", creatorId: "user-1" });

    const user = await authenticateConnection(makeRequest(), ROOM_KEY);

    expect(mockVerifyAccess).toHaveBeenCalledWith("workflow-1", "user-1", "edit");
    expect(user.userId).toBe("user-1");
  });

  it("admits a non-creator granted edit access via workflow_access", async () => {
    // Same call, but the workflow belongs to someone else — verifyAccess
    // resolving successfully is what admits the connection, not a
    // `creatorId === userId` comparison. This is the case that was broken:
    // previously nothing but the creator could ever reach this point.
    mockVerifyAccess.mockResolvedValue({ id: "workflow-1", creatorId: "someone-else" });

    const user = await authenticateConnection(makeRequest(), ROOM_KEY);

    expect(mockVerifyAccess).toHaveBeenCalledWith("workflow-1", "user-1", "edit");
    expect(user.userId).toBe("user-1");
  });

  it("rejects a user with only view-only access — collab implies edit", async () => {
    mockVerifyAccess.mockRejectedValue(
      new Error("Access denied - insufficient permissions for this workflow")
    );

    await expect(authenticateConnection(makeRequest(), ROOM_KEY)).rejects.toThrow(
      "Access denied - insufficient permissions for this workflow"
    );
    expect(mockVerifyAccess).toHaveBeenCalledWith("workflow-1", "user-1", "edit");
  });

  it("rejects a user with no access to the workflow at all", async () => {
    mockVerifyAccess.mockRejectedValue(
      new Error("Access denied - insufficient permissions for this workflow")
    );

    await expect(authenticateConnection(makeRequest(), ROOM_KEY)).rejects.toThrow(/Access denied/);
  });

  it("rejects a request for a workflow that does not exist", async () => {
    mockVerifyAccess.mockRejectedValue(new Error("Workflow not found"));

    await expect(authenticateConnection(makeRequest(), ROOM_KEY)).rejects.toThrow("Workflow not found");
  });

  it("never rejects with the retired creator-only wording", async () => {
    mockVerifyAccess.mockRejectedValue(
      new Error("Access denied - insufficient permissions for this workflow")
    );

    try {
      await authenticateConnection(makeRequest(), ROOM_KEY);
      expect.fail("expected authenticateConnection to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/is not the creator/);
    }
  });
});
