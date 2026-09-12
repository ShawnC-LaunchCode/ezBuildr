import { randomBytes } from "crypto";

import type { SignatureRequest, InsertSignatureRequest } from "@shared/schema";

import {
  signatureRequestRepository,
  workflowRepository,
  projectRepository,
  type DbTransaction,
} from "../repositories";
import { hashToken } from "../utils/encryption";
import { createError } from "../utils/errors";
import { withCurrentTenant, withTenant, withVerifiedIdentifier, getCurrentTenantId } from "../utils/rlsContext";

import { aclService as defaultAclService } from "./AclService";

/**
 * Service layer for signature request-related business logic
 * Stage 14: E-Signature Node + Document Review Portal
 *
 * RLS-2c: mixed shape, unlike the RLS-2a pilot. Authenticated methods
 * (create/get/list) carry either an explicit `tenantId` (createSignatureRequest,
 * whose `data` always includes one — signature_requests.tenant_id is NOT NULL)
 * or only `userId` + ACL (get/list), so `withTx` takes an OPTIONAL
 * `expectedTenantId` and only runs the ambient-vs-argument mismatch guard when
 * one is supplied — still the same `withCurrentTenant`/`getCurrentTenantId`
 * primitives as the pilot, just parameterised for both shapes in one service.
 *
 * The three token-based methods (getSignatureRequestByToken, signDocument,
 * declineSignature) back the PUBLIC signing portal, reached with
 * `optionalHybridAuth` + a run-token holder who is never a tenant user — there
 * is no ambient tenant to read, ever, by design. The token IS the
 * authorization: `getSignatureRequestByToken`'s initial `findByToken` lookup
 * runs under a narrow self-identification policy clause keyed on the hashed
 * token (RLS-4 precondition 2, migration 0029 — see
 * docs/architecture/TENANT_ISOLATION_RLS.md §2e), not truly unscoped. Once the
 * row is found, `request.tenantId` is a concrete value, so every write on
 * that request opens its own `withTenant(request.tenantId, ...)` transaction
 * rather than depending on `withCurrentTenant`'s ambient read.
 *
 * `markExpiredRequests` (cron/background, scans across ALL tenants) is a
 * DIFFERENT shape and is NOT covered by the fix above — there is no per-row
 * token to bootstrap from, it is a genuine cross-tenant batch read. It has
 * the same bootstrapping gap RLS-6 solved for the admin console and needs
 * the equivalent BYPASSRLS path once FORCE is on; still out of scope here,
 * flagged for that follow-up.
 */
export class SignatureRequestService {
  private signatureRequestRepo: typeof signatureRequestRepository;
  private workflowRepo: typeof workflowRepository;
  private projectRepo: typeof projectRepository;
  private aclService: typeof defaultAclService;

  constructor(
    signatureRequestRepo?: typeof signatureRequestRepository,
    workflowRepo?: typeof workflowRepository,
    projectRepo?: typeof projectRepository,
    aclService?: typeof defaultAclService
  ) {
    this.signatureRequestRepo = signatureRequestRepo ?? signatureRequestRepository;
    this.workflowRepo = workflowRepo ?? workflowRepository;
    this.projectRepo = projectRepo ?? projectRepository;
    this.aclService = aclService ?? defaultAclService;
  }

  /**
   * Reuse a caller-supplied `tx`; otherwise open exactly one transaction via
   * `withCurrentTenant`. When `expectedTenantId` is supplied, runs the same
   * ambient-vs-argument mismatch guard `CollectionService.withTx` does before
   * opening the transaction — see the class comment for why this service
   * needs the check to be optional rather than always-on.
   */
  private async withTx<T>(
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>,
    expectedTenantId?: string
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    if (expectedTenantId !== undefined) {
      const ambientTenantId = getCurrentTenantId();
      if (ambientTenantId !== undefined && ambientTenantId !== expectedTenantId) {
        throw new Error(
          `RLS: tenant mismatch — operation requested for tenant "${expectedTenantId}" but the ` +
          `request's async context is tenant "${ambientTenantId}". Refusing to run rather than ` +
          `silently scoping to the wrong tenant.`
        );
      }
    }
    return withCurrentTenant(fn);
  }

  /**
   * Generate a secure random token for signature links
   */
  private generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Create a signature request
   */
  async createSignatureRequest(
    data: Omit<InsertSignatureRequest, 'token'>,
    tx?: DbTransaction
  ): Promise<SignatureRequest> {
    return this.withTx(tx, async (scopedTx) => {
      // Validate workflow exists
      const workflow = await this.workflowRepo.findById(data.workflowId, scopedTx);
      if (!workflow) {
        throw createError.notFound("Workflow not found");
      }

      // Validate project exists
      const project = await this.projectRepo.findById(data.projectId, scopedTx);
      if (!project) {
        throw createError.notFound("Project not found");
      }

      // Generate secure token
      const token = this.generateToken();
      const hashedToken = hashToken(token);

      // Create the signature request
      const request = await this.signatureRequestRepo.create({
        ...data,
        token: hashedToken,
      }, scopedTx);

      // Create 'sent' event
      await this.signatureRequestRepo.createEvent(
        request.id,
        'sent',
        {
          signerEmail: request.signerEmail,
          signerName: request.signerName,
        },
        scopedTx
      );

      // TODO: Send email with signing link to signer
      // This would integrate with the email service

      return { ...request, token }; // Return plaintext token to caller
    }, data.tenantId);
  }

  /**
   * Get signature request by ID
   */
  async getSignatureRequest(requestId: string, userId: string, tx?: DbTransaction): Promise<SignatureRequest> {
    return this.withTx(tx, async (scopedTx) => {
      const request = await this.signatureRequestRepo.findById(requestId, scopedTx);
      if (!request) {
        throw createError.notFound("Signature request not found");
      }

      // Verify user has access to the project
      const project = await this.projectRepo.findById(request.projectId, scopedTx);
      if (!project) {
        throw createError.notFound("Project not found");
      }

      // Verify user has at least view access to the project (Dec 2025 - Security fix)
      const hasAccess = await this.aclService.hasProjectRole(userId, request.projectId, 'view', scopedTx);
      if (!hasAccess) {
        throw createError.forbidden("Access denied - insufficient permissions for this project");
      }

      return request;
    });
  }

  /**
   * Get signature request by token (for public signing portal)
   * No authentication required. See the class comment — there is no ambient
   * tenant to read here (a run-token holder is never a tenant user), so the
   * tenant only becomes known once the row is found, at which point every
   * write below opens its own `withTenant(request.tenantId, ...)` transaction.
   *
   * RLS-4 precondition 2 (closed): the initial lookup is no longer truly
   * unscoped. `signature_requests`' policy (migration 0029) carries a narrow
   * self-identification clause matching on the hashed token — the same
   * pattern `users`' self-id clause uses (0028), keyed on a token hash
   * instead of a primary key. The hash IS the verification (computed locally
   * before any DB call, never trusting anything unverified), so pinning it
   * as `app.current_signing_token` before the read lets the ONE matching row
   * through without needing a tenant, `SECURITY DEFINER`, or a bypass role.
   */
  async getSignatureRequestByToken(token: string): Promise<SignatureRequest> {
    const hashedToken = hashToken(token);
    const request = await withVerifiedIdentifier(
      'app.current_signing_token',
      hashedToken,
      (tx) => this.signatureRequestRepo.findByToken(hashedToken, tx)
    );
    if (!request) {
      throw createError.notFound("Invalid signature link");
    }

    // Check if expired
    if (new Date() > new Date(request.expiresAt)) {
      // Mark as expired if not already
      if (request.status === 'pending') {
        await withTenant(request.tenantId, (scopedTx) =>
          this.signatureRequestRepo.updateStatus(request.id, 'expired', undefined, scopedTx)
        );
      }
      throw createError.validation("This signature link has expired");
    }

    // Create 'viewed' event if pending
    if (request.status === 'pending') {
      await withTenant(request.tenantId, (scopedTx) =>
        this.signatureRequestRepo.createEvent(
          request.id,
          'viewed',
          { timestamp: new Date() },
          scopedTx
        )
      );
    }

    return request;
  }

  /**
   * Sign a document (via token)
   */
  async signDocument(token: string): Promise<SignatureRequest> {
    const request = await this.getSignatureRequestByToken(token);

    // Only allow signing if pending
    if (request.status !== 'pending') {
      throw createError.validation(
        `Document cannot be signed (current status: ${request.status})`
      );
    }

    // Update status to signed, and log the event, in ONE transaction scoped
    // to the request's own tenant (now known — see getSignatureRequestByToken).
    // TODO: Trigger workflow resume
    // This will be handled by the run resume mechanism
    return withTenant(request.tenantId, async (scopedTx) => {
      const signed = await this.signatureRequestRepo.updateStatus(
        request.id,
        'signed',
        undefined,
        scopedTx
      );

      await this.signatureRequestRepo.createEvent(
        request.id,
        'signed',
        {
          signedAt: signed.signedAt,
          signerEmail: signed.signerEmail,
          signerName: signed.signerName,
        },
        scopedTx
      );

      return signed;
    });
  }

  /**
   * Decline a signature request (via token)
   */
  async declineSignature(token: string, reason?: string): Promise<SignatureRequest> {
    const request = await this.getSignatureRequestByToken(token);

    // Only allow declining if pending
    if (request.status !== 'pending') {
      throw createError.validation(
        `Document cannot be declined (current status: ${request.status})`
      );
    }

    // TODO: Mark workflow run as failed or trigger error handling
    return withTenant(request.tenantId, async (scopedTx) => {
      const declined = await this.signatureRequestRepo.updateStatus(
        request.id,
        'declined',
        undefined,
        scopedTx
      );

      await this.signatureRequestRepo.createEvent(
        request.id,
        'declined',
        {
          declinedAt: new Date(),
          reason,
        },
        scopedTx
      );

      return declined;
    });
  }

  /**
   * Get signature events for a request
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getSignatureEvents(requestId: string, userId: string, tx?: DbTransaction) {
    return this.withTx(tx, async (scopedTx) => {
      // Verify access to request
      await this.getSignatureRequest(requestId, userId, scopedTx);

      return this.signatureRequestRepo.getEvents(requestId, scopedTx);
    });
  }

  /**
   * Get pending signature requests for a project
   */
  async getPendingRequestsByProject(
    projectId: string,
    userId: string,
    tx?: DbTransaction
  ): Promise<SignatureRequest[]> {
    return this.withTx(tx, async (scopedTx) => {
      // Verify user has access to the project
      const project = await this.projectRepo.findById(projectId, scopedTx);
      if (!project) {
        throw createError.notFound("Project not found");
      }

      // Verify user has at least view access to the project (Dec 2025 - Security fix)
      const hasAccess = await this.aclService.hasProjectRole(userId, projectId, 'view', scopedTx);
      if (!hasAccess) {
        throw createError.forbidden("Access denied - insufficient permissions for this project");
      }

      return this.signatureRequestRepo.findPendingByProjectId(projectId, scopedTx);
    });
  }

  /**
   * Mark expired signature requests as expired
   * This should be run periodically (e.g., via cron job) — a background,
   * cross-tenant caller with no single tenant to scope the transaction to.
   * See the class comment: the SELECT here is the same cross-tenant
   * bootstrapping gap RLS-6 solved for the admin console (needs a BYPASSRLS
   * connection once FORCE is on); each WRITE below is scoped to that row's
   * own resolved tenant, which is the part this ticket can make correct now.
   */
  async markExpiredRequests(): Promise<number> {
    const expiredRequests = await this.signatureRequestRepo.findExpired();

    let count = 0;
    for (const request of expiredRequests) {
      await withTenant(request.tenantId, (scopedTx) =>
        this.signatureRequestRepo.updateStatus(request.id, 'expired', undefined, scopedTx)
      );
      count++;
    }

    return count;
  }
}

// Singleton instance
export const signatureRequestService = new SignatureRequestService();
