import crypto from 'crypto';

import { eq, and, or, gt, isNull } from 'drizzle-orm';

import {
  organizations,
  organizationMemberships,
  organizationInvites,
  users,
  type Organization,
} from '../../shared/schema';
import { type DbTransaction } from '../repositories';
import { ConflictError, ForbiddenError } from '../errors/AppError';
import { AuditLogger } from '../lib/audit/auditLogger';
import { logger } from '../logger';
import { getAppBaseUrl } from '../utils/appBaseUrl';
import { hashToken } from '../utils/encryption';
import { withCurrentTenant } from '../utils/rlsContext';
import { requireOrgAdmin, isOrgMember } from '../utils/ownershipAccess';

import { authService } from './AuthService';
import { brandingService } from './BrandingService';
import { emailQueueService } from './EmailQueueService';
interface CreateOrganizationInput {
  name: string;
  description?: string;
  slug?: string;
}
interface UpdateOrganizationInput {
  name?: string;
  description?: string;
  slug?: string;
}
/**
 * Service layer for organization-related business logic.
 *
 * RLS-2d: this service has no repository layer — every method issues `db.*`
 * queries directly, so conversion means threading a transaction handle
 * through every one of them rather than through a repo's `getDb(tx)`. Every
 * public method opens exactly ONE transaction at this boundary via `withTx`
 * (copying the shape RLS-2a/2c established — see
 * docs/architecture/TENANT_ISOLATION_RLS.md §2b/§2c).
 *
 * VARIANT 1 (§2c): no method here takes an explicit `tenantId` argument —
 * organizations are addressed by `orgId`, and the tenant is either derived
 * from the acting user's own row or is simply whichever tenant the row
 * belongs to. There is nothing to cross-check the ambient tenant against, so
 * `withTx` is the two-argument form (`tx`, `fn`) with no mismatch branch —
 * still fails closed via `withCurrentTenant`'s own "no tenant in context"
 * throw.
 */
export class OrganizationService {
  /**
   * Run `fn` inside a tenant-scoped transaction opened at this service
   * boundary. Reuses a caller-supplied `tx` if given (never nests); otherwise
   * opens exactly one via `withCurrentTenant`, which reads the tenant from
   * the request's async context (RLS-1) and sets the transaction-local
   * `app.current_tenant_id` GUC for everything that runs inside `fn`.
   */
  private async withTx<T>(
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    return withCurrentTenant(fn);
  }

  /**
   * Create a new organization
   * Auto-creates admin membership for creator
   */
  async createOrganization(
    input: CreateOrganizationInput,
    creatorId: string
  ): Promise<Organization> {
    return this.withTx(undefined, async (tx) => {
      // Get user's tenantId
      const user = await tx.query.users.findFirst({
        where: eq(users.id, creatorId),
        columns: { tenantId: true },
      });
      if (!user?.tenantId) {
        throw new Error('User must belong to a tenant to create organizations');
      }
      // Create organization with tenant scoping
      const [org] = await tx
        .insert(organizations)
        .values({
          name: input.name,
          description: input.description,
          slug: input.slug,
          tenantId: user.tenantId, // Assert not null (checked above)
          createdByUserId: creatorId,
        })
        .returning();
      // Auto-create admin membership for creator
      await tx.insert(organizationMemberships).values({
        orgId: org.id,
        userId: creatorId,
        role: 'admin',
      });
      // Audit log — run on the SAME transaction (tx) to avoid deadlocking on the
      // single test-pool connection the transaction already holds.
      await AuditLogger.log({
        userId: creatorId,
        action: 'organization.create',
        resourceType: 'organization',
        resourceId: org.id,
        workspaceId: null, // Organization level event
        after: { name: org.name, slug: org.slug },
      }, tx);
      return org;
    });
  }
  /**
   * Get all organizations for a user (where they have membership)
   * Filtered by user's tenant for isolation
   */
  async getUserOrganizations(userId: string): Promise<
    Array<Organization & { role: 'admin' | 'member' }>
  > {
    return this.withTx(undefined, async (tx) => {
      // Get user's tenantId for scoping
      const user = await tx.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { tenantId: true },
      });
      if (!user?.tenantId) {
        return [];
      }
      const results = await tx
        .select({
          id: organizations.id,
          name: organizations.name,
          description: organizations.description,
          slug: organizations.slug,
          domain: organizations.domain,
          settings: organizations.settings,
          createdByUserId: organizations.createdByUserId,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
          role: organizationMemberships.role,
        })
        .from(organizations)
        .innerJoin(
          organizationMemberships,
          eq(organizationMemberships.orgId, organizations.id)
        )
        .where(
          and(
            eq(organizationMemberships.userId, userId),
            eq(organizations.tenantId, user.tenantId)
          )
        )
        .orderBy(organizations.name);
      return results as Array<Organization & { role: 'admin' | 'member' }>;
    });
  }
  /**
   * Get organization by ID
   * Requires membership to view
   */
  async getOrganizationById(orgId: string, userId: string): Promise<Organization & { role: 'admin' | 'member' }> {
    return this.withTx(undefined, async (tx) => {
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
      });
      if (!org) {
        throw new Error('Organization not found');
      }
      // Verify user has access and get their role
      const membership = await tx.query.organizationMemberships.findFirst({
        where: and(
          eq(organizationMemberships.orgId, orgId),
          eq(organizationMemberships.userId, userId)
        ),
      });
      if (!membership) {
        throw new Error('Access denied: You are not a member of this organization');
      }
      return {
        ...org,
        role: membership.role,
      };
    });
  }
  /**
   * Update organization (admin only)
   */
  async updateOrganization(
    orgId: string,
    userId: string,
    input: UpdateOrganizationInput
  ): Promise<Organization> {
    return this.withTx(undefined, async (tx) => {
      // Verify admin access
      await requireOrgAdmin(userId, orgId, tx);
      const [updated] = await tx
        .update(organizations)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, orgId))
        .returning();
      if (updated === undefined) {
        throw new Error('Organization not found');
      }
      return updated;
    });
  }
  /**
   * Get organization members with their details
   */
  async getOrganizationMembers(
    orgId: string,
    userId: string
  ): Promise<
    Array<{
      userId: string;
      email: string;
      fullName: string | null;
      role: 'admin' | 'member';
      joinedAt: Date | null;
    }>
  > {
    return this.withTx(undefined, async (tx) => {
      // Verify user has access to org
      const isMember = await isOrgMember(userId, orgId, tx);
      if (!isMember) {
        throw new Error('Access denied: You are not a member of this organization');
      }
      return tx
        .select({
          userId: organizationMemberships.userId,
          email: users.email,
          fullName: users.fullName,
          role: organizationMemberships.role,
          joinedAt: organizationMemberships.createdAt,
        })
        .from(organizationMemberships)
        .innerJoin(users, eq(users.id, organizationMemberships.userId))
        .where(eq(organizationMemberships.orgId, orgId))
        .orderBy(organizationMemberships.createdAt);
    });
  }
  /**
   * Promote member to admin (admin only)
   */
  async promoteMember(orgId: string, targetUserId: string, adminUserId: string): Promise<void> {
    await this.withTx(undefined, async (tx) => {
      // Verify admin access
      await requireOrgAdmin(adminUserId, orgId, tx);
      // Get organization for audit log
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { tenantId: true },
      });
      // Verify target is a member
      const isMember = await isOrgMember(targetUserId, orgId, tx);
      if (!isMember) {
        throw new Error('User is not a member of this organization');
      }
      // Update role to admin
      await tx
        .update(organizationMemberships)
        .set({ role: 'admin' })
        .where(
          and(
            eq(organizationMemberships.orgId, orgId),
            eq(organizationMemberships.userId, targetUserId)
          )
        );
      // Audit log
      if (org?.tenantId) {
        await AuditLogger.log({
          userId: adminUserId,
          action: 'organization.member_promote',
          resourceType: 'organization',
          resourceId: orgId,
          workspaceId: null,
          after: { userId: targetUserId, newRole: 'admin' },
        }, tx);
      }
    });
  }
  /**
   * Demote admin to member (admin only)
   */
  async demoteMember(orgId: string, targetUserId: string, adminUserId: string): Promise<void> {
    await this.withTx(undefined, async (tx) => {
      // Verify admin access
      await requireOrgAdmin(adminUserId, orgId, tx);
      // Get organization for audit log
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { tenantId: true },
      });
      // Prevent self-demotion (must use leave if want to remove self)
      if (targetUserId === adminUserId) {
        throw new Error('Cannot demote yourself. Use leave endpoint to remove yourself from the organization');
      }
      // Verify target is a member
      const isMember = await isOrgMember(targetUserId, orgId, tx);
      if (!isMember) {
        throw new Error('User is not a member of this organization');
      }
      // Update role to member
      await tx
        .update(organizationMemberships)
        .set({ role: 'member' })
        .where(
          and(
            eq(organizationMemberships.orgId, orgId),
            eq(organizationMemberships.userId, targetUserId)
          )
        );
      // Audit log
      if (org?.tenantId) {
        await AuditLogger.log({
          userId: adminUserId,
          action: 'organization.member_demote',
          resourceType: 'organization',
          resourceId: orgId,
          workspaceId: null,
          after: { userId: targetUserId, newRole: 'member' },
        }, tx);
      }
    });
  }
  /**
   * Remove member from organization (admin only)
   */
  async removeMember(orgId: string, targetUserId: string, adminUserId: string): Promise<void> {
    await this.withTx(undefined, async (tx) => {
      // Verify admin access
      await requireOrgAdmin(adminUserId, orgId, tx);
      // Get organization for audit log
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { tenantId: true },
      });
      // Prevent self-removal (must use leave endpoint)
      if (targetUserId === adminUserId) {
        throw new Error('Cannot remove yourself. Use leave endpoint to leave the organization');
      }
      // Verify target is a member
      const isMember = await isOrgMember(targetUserId, orgId, tx);
      if (!isMember) {
        throw new Error('User is not a member of this organization');
      }
      // Remove membership
      await tx
        .delete(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.orgId, orgId),
            eq(organizationMemberships.userId, targetUserId)
          )
        );
      // Audit log
      if (org?.tenantId) {
        await AuditLogger.log({
          userId: adminUserId,
          action: 'organization.member_remove',
          resourceType: 'organization',
          resourceId: orgId,
          workspaceId: null,
          after: { removedUserId: targetUserId },
        }, tx);
      }
    });
  }
  /**
   * Leave organization (any member can remove themselves)
   */
  async leaveOrganization(orgId: string, userId: string): Promise<void> {
    await this.withTx(undefined, async (tx) => {
      // Verify user is a member
      const isMember = await isOrgMember(userId, orgId, tx);
      if (!isMember) {
        throw new Error('You are not a member of this organization');
      }
      // Get user's current membership to check role
      const membership = await tx.query.organizationMemberships.findFirst({
        where: and(
          eq(organizationMemberships.orgId, orgId),
          eq(organizationMemberships.userId, userId)
        ),
      });
      // If user is an admin, check if they're the last admin
      if (membership?.role === 'admin') {
        const adminCount = await tx
          .select()
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.orgId, orgId),
              eq(organizationMemberships.role, 'admin')
            )
          );
        if (adminCount.length === 1) {
          throw new Error('Cannot leave: You are the last admin. Promote another member to admin first, or delete the organization.');
        }
      }
      // Remove membership
      await tx
        .delete(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.orgId, orgId),
            eq(organizationMemberships.userId, userId)
          )
        );
    });
  }
  /**
   * Add member to organization (admin only)
   */
  async addMember(
    orgId: string,
    targetUserId: string,
    adminUserId: string,
    role: 'admin' | 'member' = 'member'
  ): Promise<void> {
    await this.withTx(undefined, async (tx) => {
      // Verify admin access
      await requireOrgAdmin(adminUserId, orgId, tx);

      // Verify target user is in the same tenant
      const targetUser = await tx.query.users.findFirst({
        where: eq(users.id, targetUserId),
        columns: { tenantId: true },
      });
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
        columns: { tenantId: true },
      });
      if (!targetUser || !org || targetUser.tenantId !== org.tenantId) {
        throw new Error('User does not belong to the same tenant as the organization');
      }

      // Check if user already a member
      const alreadyMember = await isOrgMember(targetUserId, orgId, tx);
      if (alreadyMember) {
        throw new Error('User is already a member of this organization');
      }
      // Add membership
      await tx.insert(organizationMemberships).values({
        orgId,
        userId: targetUserId,
        role,
      });
    });
  }
  /**
   * Create organization invite by email (admin only)
   * Creates placeholder user if email doesn't exist
   * FIX #3: Wrapped in transaction - rollback if email send fails
   */
  async createInvite(
    orgId: string,
    invitedEmail: string,
    adminUserId: string
  ): Promise<{ inviteId: string; token: string }> {
    // RLS-2d: the DB work (validate + insert the invite row) and the email
    // send are DELIBERATELY two separate `withTx` calls, not one. Wrapping
    // the whole method — including `sendInviteEmail` /
    // `authService.generateSystemInviteToken`, both of which make outbound
    // network calls — in a single open transaction held it open for the
    // duration of those calls. In the test/dev environment that queue call
    // does not resolve quickly, so the transaction sat "idle in transaction"
    // holding row locks on `organization_invites` indefinitely: every
    // subsequent test hung, not failed, on the next `TRUNCATE` — the exact
    // failure shape this initiative's docs warn about, just from a slow
    // external call instead of an un-threaded `tx`. The original
    // (pre-RLS-2d) code had the same shape for the same reason ("Queue
    // invitation email (outside transaction - non-blocking)" in the comment
    // below) — RLS-2d preserves that, it just gives each DB phase its own
    // tenant-scoped transaction instead of leaving both unscoped.
    const created = await this.withTx(undefined, async (tx) => {
      // Verify admin access
      await requireOrgAdmin(adminUserId, orgId, tx);
      // Normalize email
      const normalizedEmail = invitedEmail.toLowerCase().trim();
      // Get organization details for email
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
      });
      if (!org) {
        throw new Error('Organization not found');
      }
      // Check if user already exists
      let existingUser = await tx.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      });
      let needsAccountSetup = existingUser?.isPlaceholder ?? false;
      // Create placeholder user if doesn't exist
      if (!existingUser) {
        const [placeholderUser] = await tx.insert(users).values({
          email: normalizedEmail,
          fullName: normalizedEmail.split('@')[0], // Use email prefix as name
          isPlaceholder: true,
          placeholderEmail: normalizedEmail,
          emailVerified: false,
          tenantId: org.tenantId,
        }).returning();
        existingUser = placeholderUser;
        needsAccountSetup = true;
      }
      // Check if user is already a member
      const alreadyMember = await isOrgMember(existingUser.id, orgId, tx);
      if (alreadyMember) {
        throw new ConflictError('This person is already a member of this organization');
      }
      // Check for existing pending invite (exclude expired)
      const existingInvite = await tx.query.organizationInvites.findFirst({
        where: and(
          eq(organizationInvites.orgId, orgId),
          eq(organizationInvites.invitedEmail, normalizedEmail),
          eq(organizationInvites.status, 'pending')
        ),
      });
      if (existingInvite) {
        // Allow re-invite if expired
        if (existingInvite.expiresAt !== null && new Date() > existingInvite.expiresAt) {
          // Mark old invite as expired
          await tx
            .update(organizationInvites)
            .set({ status: 'expired' })
            .where(eq(organizationInvites.id, existingInvite.id));
        } else {
          throw new ConflictError('Pending invite already exists for this email');
        }
      }
      // Generate secure token
      const token = crypto.randomBytes(32).toString('hex');
      const hashedToken = hashToken(token);
      // Create invite (expires in 7 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      // Create invite (non-blocking email - invite created regardless of email success)
      const [invite] = await tx.insert(organizationInvites).values({
        orgId,
        invitedEmail: normalizedEmail,
        invitedUserId: existingUser.id,
        invitedByUserId: adminUserId,
        token: hashedToken,
        status: 'pending',
        expiresAt,
      }).returning();
      return { invite, org, token, normalizedEmail, needsAccountSetup };
    });
    return this.finishInviteSideEffects(created, adminUserId, orgId);
  }
  /**
   * Send the invite email and record the outcome, then send the placeholder
   * account-setup email if needed, then audit-log.
   *
   * Split out of `createInvite` (RLS-2d) so the outbound network calls
   * (`sendInviteEmail` -> `emailQueueService`, and
   * `authService.generateSystemInviteToken`) run AFTER the transaction that
   * created the invite row has already committed, instead of inside it.
   * Measured, not theorised: wrapping the whole original method in one
   * `withTx` held a Postgres transaction open for the duration of those
   * calls, and in the test/dev environment that queue call does not resolve
   * quickly — the transaction sat "idle in transaction" holding row locks on
   * `organization_invites` indefinitely, and every subsequent test in the
   * file hung (not failed) waiting on the next `TRUNCATE`. Each follow-up DB
   * write below gets its own short-lived `withTx` instead of reusing one
   * long-held transaction across a slow external call — the same shape the
   * pre-RLS-2d code had for the same reason ("Queue invitation email
   * (outside transaction - non-blocking)").
   */
  private async finishInviteSideEffects(
    created: {
      invite: typeof organizationInvites.$inferSelect;
      org: typeof organizations.$inferSelect;
      token: string;
      normalizedEmail: string;
      needsAccountSetup: boolean;
    },
    adminUserId: string,
    orgId: string
  ): Promise<{ inviteId: string; token: string }> {
    const { invite, org, token, normalizedEmail, needsAccountSetup } = created;
    // Queue invitation email (non-blocking — outside any transaction; see
    // the comment above).
    try {
      await this.sendInviteEmail(normalizedEmail, org.name, token, invite.id, org.tenantId, adminUserId);
      // Mark email as sent — its own short transaction.
      await this.withTx(undefined, (tx) => tx.update(organizationInvites)
        .set({ emailSentAt: new Date() })
        .where(eq(organizationInvites.id, invite.id)));
    } catch (emailError: unknown) {
      // Log email failure but don't fail the invite
      const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown error';
      await this.withTx(undefined, async (tx) => {
        await tx.update(organizationInvites)
          .set({
            emailFailed: true,
            emailError: errorMessage
          })
          .where(eq(organizationInvites.id, invite.id));
        // Audit log the email failure
        if (org.tenantId) {
          await AuditLogger.log({
            userId: adminUserId,
            action: 'organization.invite_email_failed',
            resourceType: 'organization',
            resourceId: orgId,
            workspaceId: null,
            after: { invitedEmail: normalizedEmail, error: errorMessage },
          }, tx);
        }
      });
    }
    // A placeholder cannot authenticate yet. Send the same password-setup
    // invitation used by Admin user creation and preserve this organization
    // invite so setup -> sign in -> acceptance is one continuous flow.
    if (needsAccountSetup) {
      try {
        await authService.generateSystemInviteToken(
          normalizedEmail,
          'creator',
          `/invites/${token}/accept`
        );
      } catch (setupEmailError: unknown) {
        logger.error(
          { error: setupEmailError, inviteId: invite.id, orgId },
          'Failed to send organization invite account setup email'
        );
      }
    }
    // Audit log
    if (org.tenantId) {
      await this.withTx(undefined, (tx) => AuditLogger.log({
        userId: adminUserId,
        action: 'organization.invite_send',
        resourceType: 'organization',
        resourceId: orgId,
        workspaceId: null,
        after: { invitedEmail: normalizedEmail, inviteId: invite.id },
      }, tx));
    }
    return { inviteId: invite.id, token };
  }
  /**
   * Send invitation email with branding (using EmailQueueService)
   * Fetches tenant branding and queues email with retry logic
   */
  // eslint-disable-next-line max-params -- grouping would obscure individual parameters that are all required
  private async sendInviteEmail(
    email: string,
    orgName: string,
    token: string,
    inviteId: string,
    tenantId: string,
    invitedByUserId: string
  ): Promise<void> {
    // Fetch branding for tenant
    const branding = await brandingService.getBrandingByTenantId(tenantId);
    // Get inviter info — its own short-lived transaction (RLS-2d): this
    // method itself now runs OUTSIDE the invite-creation transaction (see
    // the comment on finishInviteSideEffects), so it cannot reuse that tx.
    const inviter = await this.withTx(undefined, (tx) => tx.query.users.findFirst({
      where: eq(users.id, invitedByUserId),
      columns: { fullName: true, email: true },
    }));
    const inviterName = inviter?.fullName ?? inviter?.email ?? 'A team member';
    // Build branded email
    const acceptUrl = `${getAppBaseUrl()}/invites/${token}/accept`;
    const senderName = branding?.emailSenderName ?? 'ezBuildr';
    const primaryColor = branding?.primaryColor ?? '#3B82F6';
    const logoUrl = branding?.logoUrl ?? '';
    const subject = `You've been invited to join ${orgName}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${logoUrl ? `<div style="text-align: center; margin-bottom: 30px;"><img src="${logoUrl}" alt="Logo" style="max-width: 150px; height: auto;"></div>` : ''}
        <div style="background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: ${primaryColor}; margin-top: 0;">You've been invited!</h2>
          <p>Hello,</p>
          <p><strong>${inviterName}</strong> has invited you to join the <strong>${orgName}</strong> organization on ${senderName}.</p>
          <p>As a member, you'll be able to collaborate on projects, workflows, and data sources.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${acceptUrl}"
               style="display: inline-block; background-color: ${primaryColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 500;">
              Accept Invitation
            </a>
          </div>
          <p style="font-size: 14px; color: #666;">
            Or copy and paste this link into your browser:<br>
            <a href="${acceptUrl}" style="color: ${primaryColor}; word-break: break-all;">${acceptUrl}</a>
          </p>
          <p style="font-size: 14px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            This invitation will expire in 7 days.
          </p>
        </div>
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
          <p>If you didn't expect this invitation, you can safely ignore this email.</p>
        </div>
      </body>
      </html>
    `;
    // Queue email with retry logic
    await emailQueueService.addToQueue(email, subject, html);
  }
  /**
   * Get pending invites for a user by email
   */
  async getPendingInvitesForUser(userId: string): Promise<
    Array<{
      inviteId: string;
      orgId: string;
      orgName: string;
      invitedByEmail: string;
      invitedByName: string | null;
      createdAt: Date | null;
      expiresAt: Date | null;
      token: string;
    }>
  > {
    return this.withTx(undefined, async (tx) => {
      // Get user's email
      const user = await tx.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (!user) {
        throw new Error('User not found');
      }
      // Get pending invites for this email that haven't expired
      return tx
        .select({
          inviteId: organizationInvites.id,
          orgId: organizationInvites.orgId,
          orgName: organizations.name,
          invitedByEmail: users.email,
          invitedByName: users.fullName,
          createdAt: organizationInvites.createdAt,
          expiresAt: organizationInvites.expiresAt,
          token: organizationInvites.token,
        })
        .from(organizationInvites)
        .innerJoin(organizations, eq(organizations.id, organizationInvites.orgId))
        .innerJoin(users, eq(users.id, organizationInvites.invitedByUserId))
        .where(
          and(
            eq(organizationInvites.invitedEmail, user.email),
            eq(organizationInvites.status, 'pending'),
            or(
              isNull(organizationInvites.expiresAt),
              gt(organizationInvites.expiresAt, new Date())
            )
          )
        );
    });
  }
  /**
   * Accept an organization invite
   */
  async acceptInvite(token: string, userId: string): Promise<{ orgId: string; orgName: string }> {
    const hashedToken = hashToken(token);
    // RLS-2d: split into a read-only decision phase and a write phase run in
    // SEPARATE `withTx` calls, rather than one transaction covering both.
    // The original shape marked an invite 'expired' and then threw — a
    // deliberate side-effect that must survive the rejection. Doing that
    // inside a single transaction makes Postgres roll the write back when
    // the throw aborts the transaction, silently undoing it (caught by
    // the "should reject expired invite" test: the invite stayed 'pending').
    // Nesting a second `withTx` inside the first was tried and rejected too
    // — the test pool is size 1, so a still-open outer transaction holds the
    // only connection and a nested one deadlocks waiting for a second.
    const decision = await this.withTx(undefined, async (tx) => {
      // Find invite by token
      const invite = await tx.query.organizationInvites.findFirst({
        where: eq(organizationInvites.token, hashedToken),
      });
      if (!invite) {
        throw new Error('Invite not found');
      }
      // Get user details
      const user = await tx.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (!user) {
        throw new Error('User not found');
      }
      // Verify email matches (case-insensitive)
      if (user.email.toLowerCase() !== invite.invitedEmail.toLowerCase()) {
        throw new ForbiddenError(
          'This invitation belongs to a different account. Sign in with the email address that received it.'
        );
      }
      // Get org details
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, invite.orgId),
      });
      if (!org) {
        throw new Error('Organization not found');
      }
      // Reopening a successfully accepted link is safe for the invited account.
      // This also recovers cleanly when the first browser request completed but its
      // response was lost.
      if (invite.status === 'accepted') {
        return { kind: 'already-accepted' as const, orgId: org.id, orgName: org.name };
      }
      if (invite.status === 'revoked') {
        throw new ConflictError('Invite has been revoked');
      }
      if (
        invite.status === 'expired' ||
        (invite.expiresAt !== null && new Date() > invite.expiresAt)
      ) {
        return { kind: 'expired' as const, inviteId: invite.id, wasPending: invite.status === 'pending' };
      }
      return { kind: 'accept' as const, invite, user, org };
    });

    if (decision.kind === 'already-accepted') {
      return { orgId: decision.orgId, orgName: decision.orgName };
    }
    if (decision.kind === 'expired') {
      if (decision.wasPending) {
        await this.withTx(undefined, (tx) => tx
          .update(organizationInvites)
          .set({ status: 'expired' })
          .where(eq(organizationInvites.id, decision.inviteId)));
      }
      throw new ConflictError('Invite has expired');
    }

    // decision.kind === 'accept'
    const { invite, user, org } = decision;
    return this.withTx(undefined, async (tx) => {
      // Accept. Membership insertion is idempotent so a user who was added
      // through another admin path does not remain both active and
      // perpetually pending.
      await tx.insert(organizationMemberships).values({
        orgId: invite.orgId,
        userId,
        role: 'member',
      }).onConflictDoNothing();
      // Mark invite as accepted
      await tx
        .update(organizationInvites)
        .set({
          status: 'accepted',
          acceptedAt: new Date(),
        })
        .where(eq(organizationInvites.id, invite.id));
      // If user was a placeholder, mark as real user
      if (user.isPlaceholder) {
        await tx
          .update(users)
          .set({
            isPlaceholder: false,
            placeholderEmail: null,
          })
          .where(eq(users.id, userId));
      }
      // Audit log
      if (org.tenantId) {
        await AuditLogger.log({
          userId: userId,
          action: 'organization.invite_accept',
          resourceType: 'organization',
          resourceId: invite.orgId,
          workspaceId: null,
          after: { email: invite.invitedEmail },
        }, tx);
      }
      return { orgId: org.id, orgName: org.name };
    });
  }
  /**
   * Revoke an invite (admin only)
   * FIX #8: Cleanup placeholder user if no longer needed
   */
  async revokeInvite(inviteId: string, adminUserId: string): Promise<void> {
    await this.withTx(undefined, async (tx) => {
      const invite = await tx.query.organizationInvites.findFirst({
        where: eq(organizationInvites.id, inviteId),
      });
      if (!invite) {
        throw new Error('Invite not found');
      }
      // Verify admin access
      await requireOrgAdmin(adminUserId, invite.orgId, tx);
      // Get organization for audit log
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, invite.orgId),
        columns: { tenantId: true },
      });
      // Mark as revoked
      await tx
        .update(organizationInvites)
        .set({ status: 'revoked' })
        .where(eq(organizationInvites.id, inviteId));
      // Audit log
      if (org?.tenantId) {
        await AuditLogger.log({
          workspaceId: org.tenantId,
          userId: adminUserId,
          action: 'organization.invite_revoke',
          resourceType: 'organization',
          resourceId: invite.orgId,
          after: { inviteId, email: invite.invitedEmail },
        }, tx);
      }
      // FIX #8: Cleanup placeholder user if this was the only invite
      if (invite.invitedUserId) {
        await this.cleanupPlaceholderUserIfNeeded(invite.invitedUserId, tx);
      }
    });
  }
  /**
   * Get invites for an organization (admin only)
   */
  async getOrganizationInvites(
    orgId: string,
    adminUserId: string
  ): Promise<
    Array<{
      inviteId: string;
      invitedEmail: string;
      status: string;
      createdAt: Date | null;
      expiresAt: Date | null;
      invitedByEmail: string;
      invitedByName: string | null;
    }>
  > {
    return this.withTx(undefined, async (tx) => {
      // Verify admin access
      await requireOrgAdmin(adminUserId, orgId, tx);
      return tx
        .select({
          inviteId: organizationInvites.id,
          invitedEmail: organizationInvites.invitedEmail,
          status: organizationInvites.status,
          createdAt: organizationInvites.createdAt,
          expiresAt: organizationInvites.expiresAt,
          invitedByEmail: users.email,
          invitedByName: users.fullName,
        })
        .from(organizationInvites)
        .innerJoin(users, eq(users.id, organizationInvites.invitedByUserId))
        .where(
          and(
            eq(organizationInvites.orgId, orgId),
            eq(organizationInvites.status, 'pending')
          )
        );
    });
  }
  /**
   * Delete organization (admin only)
   * FIX #7: Allow deletion to prevent stuck state
   *
   * Rules:
   * - Only admins can delete
   * - Organization must have no assets (projects, workflows, databases)
   * - Cascades to memberships and invites
   */
  async deleteOrganization(orgId: string, adminUserId: string): Promise<void> {
    await this.withTx(undefined, async (tx) => {
      const { projects, workflows, datavaultDatabases } = await import('../../shared/schema');
      // Verify admin access
      await requireOrgAdmin(adminUserId, orgId, tx);
      // Check if org owns any assets
      const ownedProjects = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.ownerType, 'org'), eq(projects.ownerUuid, orgId)))
        .limit(1);
      if (ownedProjects.length > 0) {
        throw new Error('Cannot delete organization: Organization owns projects. Transfer or delete them first.');
      }
      const ownedWorkflows = await tx
        .select()
        .from(workflows)
        .where(and(eq(workflows.ownerType, 'org'), eq(workflows.ownerUuid, orgId)))
        .limit(1);
      if (ownedWorkflows.length > 0) {
        throw new Error('Cannot delete organization: Organization owns workflows. Transfer or delete them first.');
      }
      const ownedDatabases = await tx
        .select()
        .from(datavaultDatabases)
        .where(and(eq(datavaultDatabases.ownerType, 'org'), eq(datavaultDatabases.ownerUuid, orgId)))
        .limit(1);
      if (ownedDatabases.length > 0) {
        throw new Error('Cannot delete organization: Organization owns databases. Transfer or delete them first.');
      }
      // Delete organization (cascades to memberships and invites)
      await tx.delete(organizations).where(eq(organizations.id, orgId));
    });
  }
  /**
   * Cleanup placeholder user if no longer needed
   * FIX #8: Delete placeholder users with no pending invites and no memberships
   *
   * Rules:
   * - User must be placeholder (isPlaceholder = true)
   * - User must have no pending invites
   * - User must have no organization memberships
   *
   * Always called from inside an already-open `withTx` transaction (from
   * `revokeInvite`) — reuses that `tx` rather than opening a nested one.
   */
  private async cleanupPlaceholderUserIfNeeded(userId: string, tx: DbTransaction): Promise<void> {
    try {
      const user = await tx.query.users.findFirst({
        where: eq(users.id, userId),
      });
      // Only cleanup if user is a placeholder
      if (!user?.isPlaceholder) {
        return;
      }
      // Check if user has any memberships
      const memberships = await tx
        .select()
        .from(organizationMemberships)
        .where(eq(organizationMemberships.userId, userId))
        .limit(1);
      if (memberships.length > 0) {
        return; // User is a member, keep them
      }
      // Check if user has any pending invites (within same transaction)
      const pendingInvites = await tx
        .select()
        .from(organizationInvites)
        .where(
          and(
            eq(organizationInvites.invitedUserId, userId),
            eq(organizationInvites.status, 'pending'),
            or(
              isNull(organizationInvites.expiresAt),
              gt(organizationInvites.expiresAt, new Date())
            )
          )
        )
        .limit(1);
      if (pendingInvites.length > 0) {
        return; // User has pending invites, keep them
      }
      // Safe to delete - no memberships, no pending invites
      await tx.delete(users).where(eq(users.id, userId));
      logger.info({ userId }, "Cleaned up placeholder user (no pending invites or memberships)");
    } catch (error: unknown) {
      // Don't fail the operation if cleanup fails
      logger.error({ err: error, userId }, "Failed to cleanup placeholder user");
    }
  }
}
// Singleton instance
export const organizationService = new OrganizationService();
