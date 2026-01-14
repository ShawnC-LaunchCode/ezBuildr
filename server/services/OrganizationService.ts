import crypto from 'crypto';

import { eq, and, or, lt, gt } from 'drizzle-orm';

import {
  organizations,
  organizationMemberships,
  organizationInvites,
  users,
  type Organization,
} from '../../shared/schema';
import { db } from '../db';
import { AuditLogger } from '../lib/audit/auditLogger';
import { canManageOrg, requireOrgAdmin, isOrgMember } from '../utils/ownershipAccess';


import { brandingService } from './BrandingService';
import { emailQueueService } from './EmailQueueService';
import { sendEmail } from './sendgrid';

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

export class OrganizationService {
  /**
   * Create a new organization
   * Auto-creates admin membership for creator
   */
  async createOrganization(
    input: CreateOrganizationInput,
    creatorId: string
  ): Promise<Organization> {
    // Get user's tenantId
    const user = await db.query.users.findFirst({
      where: eq(users.id, creatorId),
      columns: { tenantId: true },
    });

    if (!user?.tenantId) {
      throw new Error('User must belong to a tenant to create organizations');
    }

    return db.transaction(async (tx) => {
      // Create organization with tenant scoping
      const [org] = await tx
        .insert(organizations)
        .values({
          name: input.name,
          description: input.description,
          slug: input.slug,
          tenantId: user.tenantId!, // Assert not null (checked above)
          createdByUserId: creatorId,
        })
        .returning();

      // Auto-create admin membership for creator
      await tx.insert(organizationMemberships).values({
        orgId: org.id,
        userId: creatorId,
        role: 'admin',
      });

      // Audit log
      await AuditLogger.log({
        userId: creatorId,
        action: 'organization.create',
        resourceType: 'organization',
        resourceId: org.id,
        workspaceId: '', // Organization level event
        after: { name: org.name, slug: org.slug },
      });

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
    // Get user's tenantId for scoping
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { tenantId: true },
    });

    if (!user?.tenantId) {
      return [];
    }

    const results = await db
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
  }

  /**
   * Get organization by ID
   * Requires membership to view
   */
  async getOrganizationById(orgId: string, userId: string): Promise<Organization> {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    // Verify user has access
    const isMember = await isOrgMember(userId, orgId);
    if (!isMember) {
      throw new Error('Access denied: You are not a member of this organization');
    }

    return org;
  }

  /**
   * Update organization (admin only)
   */
  async updateOrganization(
    orgId: string,
    userId: string,
    input: UpdateOrganizationInput
  ): Promise<Organization> {
    // Verify admin access
    await requireOrgAdmin(userId, orgId);

    const [updated] = await db
      .update(organizations)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId))
      .returning();

    if (!updated) {
      throw new Error('Organization not found');
    }

    return updated;
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
    // Verify user has access to org
    const isMember = await isOrgMember(userId, orgId);
    if (!isMember) {
      throw new Error('Access denied: You are not a member of this organization');
    }

    return db
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
  }

  /**
   * Promote member to admin (admin only)
   */
  async promoteMember(orgId: string, targetUserId: string, adminUserId: string): Promise<void> {
    // Verify admin access
    await requireOrgAdmin(adminUserId, orgId);

    // Get organization for audit log
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: { tenantId: true },
    });

    // Verify target is a member
    const isMember = await isOrgMember(targetUserId, orgId);
    if (!isMember) {
      throw new Error('User is not a member of this organization');
    }

    // Update role to admin
    await db
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
        workspaceId: '',
        after: { userId: targetUserId, newRole: 'admin' },
      });
    }
  }

  /**
   * Demote admin to member (admin only)
   */
  async demoteMember(orgId: string, targetUserId: string, adminUserId: string): Promise<void> {
    // Verify admin access
    await requireOrgAdmin(adminUserId, orgId);

    // Get organization for audit log
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: { tenantId: true },
    });

    // Prevent self-demotion (must use leave if want to remove self)
    if (targetUserId === adminUserId) {
      throw new Error('Cannot demote yourself. Use leave endpoint to remove yourself from the organization');
    }

    // Verify target is a member
    const isMember = await isOrgMember(targetUserId, orgId);
    if (!isMember) {
      throw new Error('User is not a member of this organization');
    }

    // Update role to member
    await db
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
        workspaceId: '',
        after: { userId: targetUserId, newRole: 'member' },
      });
    }
  }

  /**
   * Remove member from organization (admin only)
   */
  async removeMember(orgId: string, targetUserId: string, adminUserId: string): Promise<void> {
    // Verify admin access
    await requireOrgAdmin(adminUserId, orgId);

    // Get organization for audit log
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
      columns: { tenantId: true },
    });

    // Prevent self-removal (must use leave endpoint)
    if (targetUserId === adminUserId) {
      throw new Error('Cannot remove yourself. Use leave endpoint to leave the organization');
    }

    // Verify target is a member
    const isMember = await isOrgMember(targetUserId, orgId);
    if (!isMember) {
      throw new Error('User is not a member of this organization');
    }

    // Remove membership
    await db
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
        workspaceId: '',
        after: { removedUserId: targetUserId },
      });
    }
  }

  /**
   * Leave organization (any member can remove themselves)
   */
  async leaveOrganization(orgId: string, userId: string): Promise<void> {
    // Verify user is a member
    const isMember = await isOrgMember(userId, orgId);
    if (!isMember) {
      throw new Error('You are not a member of this organization');
    }

    // Get user's current membership to check role
    const membership = await db.query.organizationMemberships.findFirst({
      where: and(
        eq(organizationMemberships.orgId, orgId),
        eq(organizationMemberships.userId, userId)
      ),
    });

    // If user is an admin, check if they're the last admin
    if (membership?.role === 'admin') {
      const adminCount = await db
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
    await db
      .delete(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.orgId, orgId),
          eq(organizationMemberships.userId, userId)
        )
      );
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
    // Verify admin access
    await requireOrgAdmin(adminUserId, orgId);

    // Check if user already a member
    const alreadyMember = await isOrgMember(targetUserId, orgId);
    if (alreadyMember) {
      throw new Error('User is already a member of this organization');
    }
    // console.log(`[OrganizationService] Adding member ${targetUserId} to org ${orgId} with role ${role}`);

    // Add membership
    await db.insert(organizationMemberships).values({
      orgId,
      userId: targetUserId,
      role,
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
    // Verify admin access
    await requireOrgAdmin(adminUserId, orgId);

    // Normalize email
    const normalizedEmail = invitedEmail.toLowerCase().trim();

    // Get organization details for email
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    // Check if user already exists
    let existingUser = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    // Create placeholder user if doesn't exist
    if (!existingUser) {
      const [placeholderUser] = await db.insert(users).values({
        email: normalizedEmail,
        fullName: normalizedEmail.split('@')[0], // Use email prefix as name
        isPlaceholder: true,
        placeholderEmail: normalizedEmail,
        emailVerified: false,
        tenantId: org.tenantId,
      }).returning();
      existingUser = placeholderUser;
    }

    // Check if user is already a member
    const alreadyMember = await isOrgMember(existingUser.id, orgId);
    if (alreadyMember) {
      throw new Error('User is already a member of this organization');
    }

    // Check for existing pending invite (exclude expired)
    const existingInvite = await db.query.organizationInvites.findFirst({
      where: and(
        eq(organizationInvites.orgId, orgId),
        eq(organizationInvites.invitedEmail, normalizedEmail),
        eq(organizationInvites.status, 'pending')
      ),
    });

    if (existingInvite) {
      // Allow re-invite if expired
      if (existingInvite.expiresAt && new Date() > existingInvite.expiresAt) {
        // Mark old invite as expired
        await db
          .update(organizationInvites)
          .set({ status: 'expired' })
          .where(eq(organizationInvites.id, existingInvite.id));
      } else {
        throw new Error('Pending invite already exists for this email');
      }
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Create invite (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invite (non-blocking email - invite created regardless of email success)
    const [invite] = await db.insert(organizationInvites).values({
      orgId,
      invitedEmail: normalizedEmail,
      invitedUserId: existingUser.id,
      invitedByUserId: adminUserId,
      token,
      status: 'pending',
      expiresAt,
    }).returning();

    // Queue invitation email (outside transaction - non-blocking)
    try {
      await this.sendInviteEmail(normalizedEmail, org.name, token, invite.id, org.tenantId, adminUserId);

      // Mark email as sent
      await db.update(organizationInvites)
        .set({ emailSentAt: new Date() })
        .where(eq(organizationInvites.id, invite.id));
    } catch (emailError) {
      // Log email failure but don't fail the invite
      const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown error';

      await db.update(organizationInvites)
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
          workspaceId: '',
          after: { invitedEmail: normalizedEmail, error: errorMessage },
        });
      }
    }

    // Audit log
    if (org.tenantId) {
      await AuditLogger.log({
        userId: adminUserId,
        action: 'organization.invite_send',
        resourceType: 'organization',
        resourceId: orgId,
        workspaceId: '',
        after: { invitedEmail: normalizedEmail, token },
      });
    }

    return { inviteId: invite.id, token };
  }

  /**
   * Send invitation email with branding (using EmailQueueService)
   * Fetches tenant branding and queues email with retry logic
   */
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

    // Get inviter info
    const inviter = await db.query.users.findFirst({
      where: eq(users.id, invitedByUserId),
      columns: { fullName: true, email: true },
    });

    const inviterName = inviter?.fullName || inviter?.email || 'A team member';

    // Build branded email
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const acceptUrl = `${baseUrl}/invites/${token}/accept`;
    const senderName = branding?.emailSenderName || 'ezBuildr';
    const primaryColor = branding?.primaryColor || '#3B82F6';
    const logoUrl = branding?.logoUrl || '';

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
    // Get user's email
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get pending invites for this email that haven't expired
    return db
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
            eq(organizationInvites.expiresAt, null as any),
            gt(organizationInvites.expiresAt, new Date())
          )
        )
      );
  }

  /**
   * Accept an organization invite
   */
  async acceptInvite(token: string, userId: string): Promise<{ orgId: string; orgName: string }> {
    // Find invite by token
    const invite = await db.query.organizationInvites.findFirst({
      where: eq(organizationInvites.token, token),
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    // Check if already accepted
    if (invite.status === 'accepted') {
      throw new Error('Invite has already been accepted');
    }

    // Check if revoked
    if (invite.status === 'revoked') {
      throw new Error('Invite has been revoked');
    }

    // Check expiry
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      // Mark as expired
      await db
        .update(organizationInvites)
        .set({ status: 'expired' })
        .where(eq(organizationInvites.id, invite.id));

      throw new Error('Invite has expired');
    }

    // Get user details
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify email matches (case-insensitive)
    if (user.email.toLowerCase() !== invite.invitedEmail.toLowerCase()) {
      throw new Error('Invite email does not match your account email');
    }

    // Get org details
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, invite.orgId),
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    // FIX #2: Accept invite in transaction with membership check INSIDE to prevent race condition
    await db.transaction(async (tx) => {
      // Check if already a member (inside transaction to prevent race condition)
      const existingMembership = await tx
        .select()
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.orgId, invite.orgId),
            eq(organizationMemberships.userId, userId)
          )
        )
        .limit(1);

      if (existingMembership.length > 0) {
        throw new Error('You are already a member of this organization');
      }

      // Create membership
      await tx.insert(organizationMemberships).values({
        orgId: invite.orgId,
        userId,
        role: 'member',
      });

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
    });

    // Audit log (after transaction succeeds)
    if (org.tenantId) {
      await AuditLogger.log({
        userId: userId,
        action: 'organization.invite_accept',
        resourceType: 'organization',
        resourceId: invite.orgId,
        workspaceId: '',
        after: { email: invite.invitedEmail },
      });
    }

    return { orgId: org.id, orgName: org.name };
  }

  /**
   * Revoke an invite (admin only)
   * FIX #8: Cleanup placeholder user if no longer needed
   */
  async revokeInvite(inviteId: string, adminUserId: string): Promise<void> {
    const invite = await db.query.organizationInvites.findFirst({
      where: eq(organizationInvites.id, inviteId),
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    // Verify admin access
    await requireOrgAdmin(adminUserId, invite.orgId);

    // Get organization for audit log
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, invite.orgId),
      columns: { tenantId: true },
    });

    // Mark as revoked
    await db
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
      });
    }

    // FIX #8: Cleanup placeholder user if this was the only invite
    if (invite.invitedUserId) {
      await this.cleanupPlaceholderUserIfNeeded(invite.invitedUserId);
    }
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
    // Verify admin access
    await requireOrgAdmin(adminUserId, orgId);

    return db
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
      .where(eq(organizationInvites.orgId, orgId));
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
    const { projects, workflows, datavaultDatabases } = await import('../../shared/schema');

    // Verify admin access
    await requireOrgAdmin(adminUserId, orgId);

    // Check if org owns any assets
    const ownedProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.ownerType, 'org'), eq(projects.ownerUuid, orgId)))
      .limit(1);

    if (ownedProjects.length > 0) {
      throw new Error('Cannot delete organization: Organization owns projects. Transfer or delete them first.');
    }

    const ownedWorkflows = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.ownerType, 'org'), eq(workflows.ownerUuid, orgId)))
      .limit(1);

    if (ownedWorkflows.length > 0) {
      throw new Error('Cannot delete organization: Organization owns workflows. Transfer or delete them first.');
    }

    const ownedDatabases = await db
      .select()
      .from(datavaultDatabases)
      .where(and(eq(datavaultDatabases.ownerType, 'org'), eq(datavaultDatabases.ownerUuid, orgId)))
      .limit(1);

    if (ownedDatabases.length > 0) {
      throw new Error('Cannot delete organization: Organization owns databases. Transfer or delete them first.');
    }

    // Delete in transaction (memberships and invites will cascade via ON DELETE CASCADE)
    await db.transaction(async (tx) => {
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
   */
  private async cleanupPlaceholderUserIfNeeded(userId: string): Promise<void> {
    try {
      await db.transaction(async (tx) => {
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
                eq(organizationInvites.expiresAt, null as any),
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

        console.info(`Cleaned up placeholder user ${userId} (no pending invites or memberships)`);
      });
    } catch (error) {
      // Don't fail the operation if cleanup fails
      console.error('Failed to cleanup placeholder user:', error);
    }
  }
}

// Singleton instance
export const organizationService = new OrganizationService();
