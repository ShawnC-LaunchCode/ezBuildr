import { and, eq, or, sql, isNull } from "drizzle-orm";

import { templateShares, users } from "../../shared/schema";
import { db } from "../db";

export class TemplateShareRepository {
  /**
   * List all shares for a specific template
   * Returns both accepted (userId set) and pending (pendingEmail set) shares
   */
  async listByTemplate(templateId: string) {
    return db
      .select({
        id: templateShares.id,
        templateId: templateShares.templateId,
        userId: templateShares.userId,
        userEmail: users.email,
        pendingEmail: templateShares.pendingEmail,
        access: templateShares.access,
        invitedAt: templateShares.invitedAt,
        acceptedAt: templateShares.acceptedAt,
      })
      .from(templateShares)
      .leftJoin(users, eq(users.id, templateShares.userId))
      .where(eq(templateShares.templateId, templateId));
  }

  /**
   * List all templates shared with a specific user (by userId or their email)
   */
  async listForUser(userId: string, userEmail: string) {
    return db
      .select({
        id: templateShares.id,
        templateId: templateShares.templateId,
        access: templateShares.access,
        invitedAt: templateShares.invitedAt,
        acceptedAt: templateShares.acceptedAt,
      })
      .from(templateShares)
      .where(
        or(
          eq(templateShares.userId, userId),
          eq(templateShares.pendingEmail, userEmail.toLowerCase())
        )
      );
  }

  /**
   * Add a share for an existing user
   */
  async addUserShare(templateId: string, targetUserId: string, access: "use" | "edit") {
    const [share] = await db
      .insert(templateShares)
      .values({
        templateId,
        userId: targetUserId,
        access,
      })
      .onConflictDoNothing()
      .returning();

    return share;
  }

  /**
   * Add a pending share by email (for users not yet in the system)
   */
  async addEmailInvite(templateId: string, email: string, access: "use" | "edit") {
    const [share] = await db
      .insert(templateShares)
      .values({
        templateId,
        pendingEmail: email.toLowerCase(),
        access,
      })
      .onConflictDoNothing()
      .returning();

    return share;
  }

  /**
   * Accept pending email invites when a user logs in
   * Converts pendingEmail shares to userId shares
   */
  async acceptPendingForUser(userId: string, email: string) {
    return db
      .update(templateShares)
      .set({
        userId,
        acceptedAt: sql`now()`,
        pendingEmail: null,
      })
      .where(
        and(
          eq(templateShares.pendingEmail, email.toLowerCase()),
          isNull(templateShares.userId)
        )
      )
      .returning();
  }

  /**
   * Update access level for a share
   */
  async updateAccess(shareId: string, access: "use" | "edit") {
    const [share] = await db
      .update(templateShares)
      .set({ access })
      .where(eq(templateShares.id, shareId))
      .returning();

    return share;
  }

  /**
   * Revoke a share (delete it)
   */
  async revoke(shareId: string) {
    await db.delete(templateShares).where(eq(templateShares.id, shareId));
    return true;
  }

  /**
   * Check if a user has access to a template and what level
   */
  async getAccessLevel(templateId: string, userId: string, userEmail: string): Promise<"use" | "edit" | null> {
    const [share] = await db
      .select({
        access: templateShares.access,
      })
      .from(templateShares)
      .where(
        and(
          eq(templateShares.templateId, templateId),
          or(
            eq(templateShares.userId, userId),
            eq(templateShares.pendingEmail, userEmail.toLowerCase())
          )
        )
      )
      .limit(1);

    return share?.access || null;
  }

  /**
   * Check if a share exists for a template and user/email
   */
  async findByTemplateAndUser(
    templateId: string,
    userId?: string,
    email?: string
  ) {
    const conditions = [eq(templateShares.templateId, templateId)];

    if (userId) {
      conditions.push(eq(templateShares.userId, userId));
    }

    if (email) {
      conditions.push(eq(templateShares.pendingEmail, email.toLowerCase()));
    }

    const [share] = await db
      .select()
      .from(templateShares)
      .where(and(...conditions))
      .limit(1);

    return share;
  }
}
