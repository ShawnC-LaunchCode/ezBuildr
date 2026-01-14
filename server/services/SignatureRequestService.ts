import { randomBytes } from "crypto";

import type { SignatureRequest, InsertSignatureRequest } from "@shared/schema";

import {
  signatureRequestRepository,
  workflowRepository,
  projectRepository,
} from "../repositories";
import { createError } from "../utils/errors";


import { aclService as defaultAclService } from "./AclService";

/**
 * Service layer for signature request-related business logic
 * Stage 14: E-Signature Node + Document Review Portal
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
    this.signatureRequestRepo = signatureRequestRepo || signatureRequestRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
    this.projectRepo = projectRepo || projectRepository;
    this.aclService = aclService || defaultAclService;
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
    data: Omit<InsertSignatureRequest, 'token'>
  ): Promise<SignatureRequest> {
    // Validate workflow exists
    const workflow = await this.workflowRepo.findById(data.workflowId);
    if (!workflow) {
      throw createError.notFound("Workflow not found");
    }

    // Validate project exists
    const project = await this.projectRepo.findById(data.projectId);
    if (!project) {
      throw createError.notFound("Project not found");
    }

    // Generate secure token
    const token = this.generateToken();

    // Create the signature request
    const request = await this.signatureRequestRepo.create({
      ...data,
      token,
    });

    // Create 'sent' event
    await this.signatureRequestRepo.createEvent(
      request.id,
      'sent',
      {
        signerEmail: request.signerEmail,
        signerName: request.signerName,
      }
    );

    // TODO: Send email with signing link to signer
    // This would integrate with the email service

    return request;
  }

  /**
   * Get signature request by ID
   */
  async getSignatureRequest(requestId: string, userId: string): Promise<SignatureRequest> {
    const request = await this.signatureRequestRepo.findById(requestId);
    if (!request) {
      throw createError.notFound("Signature request not found");
    }

    // Verify user has access to the project
    const project = await this.projectRepo.findById(request.projectId);
    if (!project) {
      throw createError.notFound("Project not found");
    }

    // Verify user has at least view access to the project (Dec 2025 - Security fix)
    const hasAccess = await this.aclService.hasProjectRole(userId, request.projectId, 'view');
    if (!hasAccess) {
      throw createError.forbidden("Access denied - insufficient permissions for this project");
    }

    return request;
  }

  /**
   * Get signature request by token (for public signing portal)
   * No authentication required
   */
  async getSignatureRequestByToken(token: string): Promise<SignatureRequest> {
    const request = await this.signatureRequestRepo.findByToken(token);
    if (!request) {
      throw createError.notFound("Invalid signature link");
    }

    // Check if expired
    if (new Date() > new Date(request.expiresAt)) {
      // Mark as expired if not already
      if (request.status === 'pending') {
        await this.signatureRequestRepo.updateStatus(request.id, 'expired');
      }
      throw createError.validation("This signature link has expired");
    }

    // Create 'viewed' event if pending
    if (request.status === 'pending') {
      await this.signatureRequestRepo.createEvent(
        request.id,
        'viewed',
        { timestamp: new Date() }
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

    // Update status to signed
    const updated = await this.signatureRequestRepo.updateStatus(
      request.id,
      'signed'
    );

    // Create 'signed' event
    await this.signatureRequestRepo.createEvent(
      request.id,
      'signed',
      {
        signedAt: updated.signedAt,
        signerEmail: updated.signerEmail,
        signerName: updated.signerName,
      }
    );

    // TODO: Trigger workflow resume
    // This will be handled by the run resume mechanism

    return updated;
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

    // Update status to declined
    const updated = await this.signatureRequestRepo.updateStatus(
      request.id,
      'declined'
    );

    // Create 'declined' event
    await this.signatureRequestRepo.createEvent(
      request.id,
      'declined',
      {
        declinedAt: new Date(),
        reason,
      }
    );

    // TODO: Mark workflow run as failed or trigger error handling

    return updated;
  }

  /**
   * Get signature events for a request
   */
  async getSignatureEvents(requestId: string, userId: string) {
    // Verify access to request
    await this.getSignatureRequest(requestId, userId);

    return this.signatureRequestRepo.getEvents(requestId);
  }

  /**
   * Get pending signature requests for a project
   */
  async getPendingRequestsByProject(
    projectId: string,
    userId: string
  ): Promise<SignatureRequest[]> {
    // Verify user has access to the project
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw createError.notFound("Project not found");
    }

    // Verify user has at least view access to the project (Dec 2025 - Security fix)
    const hasAccess = await this.aclService.hasProjectRole(userId, projectId, 'view');
    if (!hasAccess) {
      throw createError.forbidden("Access denied - insufficient permissions for this project");
    }

    return this.signatureRequestRepo.findPendingByProjectId(projectId);
  }

  /**
   * Mark expired signature requests as expired
   * This should be run periodically (e.g., via cron job)
   */
  async markExpiredRequests(): Promise<number> {
    const expiredRequests = await this.signatureRequestRepo.findExpired();

    let count = 0;
    for (const request of expiredRequests) {
      await this.signatureRequestRepo.updateStatus(request.id, 'expired');
      count++;
    }

    return count;
  }
}

// Singleton instance
export const signatureRequestService = new SignatureRequestService();
