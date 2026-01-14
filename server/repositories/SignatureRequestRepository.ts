import { eq, and, desc, lt } from "drizzle-orm";

import {
  signatureRequests,
  signatureEvents,
  type SignatureRequest,
  type InsertSignatureRequest,
  type SignatureEvent,
  type InsertSignatureEvent
} from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for signature request data access
 * Stage 14: E-Signature Node + Document Review Portal
 */
export class SignatureRequestRepository extends BaseRepository<
  typeof signatureRequests,
  SignatureRequest,
  InsertSignatureRequest
> {
  constructor(dbInstance?: typeof db) {
    super(signatureRequests, dbInstance);
  }

  /**
   * Find signature requests by run ID
   */
  async findByRunId(runId: string, tx?: DbTransaction): Promise<SignatureRequest[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.runId, runId))
      .orderBy(desc(signatureRequests.createdAt));
  }

  /**
   * Find signature requests by workflow ID
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<SignatureRequest[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.workflowId, workflowId))
      .orderBy(desc(signatureRequests.createdAt));
  }

  /**
   * Find signature request by token
   */
  async findByToken(token: string, tx?: DbTransaction): Promise<SignatureRequest | null> {
    const database = this.getDb(tx);
    const [request] = await database
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.token, token))
      .limit(1);
    return request || null;
  }

  /**
   * Find signature request by run ID and node ID
   */
  async findByRunAndNode(
    runId: string,
    nodeId: string,
    tx?: DbTransaction
  ): Promise<SignatureRequest | null> {
    const database = this.getDb(tx);
    const [request] = await database
      .select()
      .from(signatureRequests)
      .where(
        and(
          eq(signatureRequests.runId, runId),
          eq(signatureRequests.nodeId, nodeId)
        )
      )
      .limit(1);
    return request || null;
  }

  /**
   * Find pending signature requests by project ID
   */
  async findPendingByProjectId(projectId: string, tx?: DbTransaction): Promise<SignatureRequest[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(signatureRequests)
      .where(
        and(
          eq(signatureRequests.projectId, projectId),
          eq(signatureRequests.status, 'pending')
        )
      )
      .orderBy(desc(signatureRequests.createdAt));
  }

  /**
   * Find expired signature requests
   */
  async findExpired(tx?: DbTransaction): Promise<SignatureRequest[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(signatureRequests)
      .where(
        and(
          eq(signatureRequests.status, 'pending'),
          lt(signatureRequests.expiresAt, new Date())
        )
      );
  }

  /**
   * Update signature request status
   */
  async updateStatus(
    requestId: string,
    status: 'signed' | 'declined' | 'expired',
    tx?: DbTransaction
  ): Promise<SignatureRequest> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(signatureRequests)
      .set({
        status,
        signedAt: status === 'signed' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(signatureRequests.id, requestId))
      .returning();
    return updated;
  }

  /**
   * Create a signature event
   */
  async createEvent(
    signatureRequestId: string,
    type: 'sent' | 'viewed' | 'signed' | 'declined',
    payload?: any,
    tx?: DbTransaction
  ): Promise<SignatureEvent> {
    const database = this.getDb(tx);
    const [event] = await database
      .insert(signatureEvents)
      .values({
        signatureRequestId,
        type,
        payload,
      })
      .returning();
    return event;
  }

  /**
   * Get events for a signature request
   */
  async getEvents(
    signatureRequestId: string,
    tx?: DbTransaction
  ): Promise<SignatureEvent[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(signatureEvents)
      .where(eq(signatureEvents.signatureRequestId, signatureRequestId))
      .orderBy(desc(signatureEvents.timestamp));
  }
}

// Singleton instance
export const signatureRequestRepository = new SignatureRequestRepository();
