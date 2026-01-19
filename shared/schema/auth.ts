import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import {
    index,
    uniqueIndex,
    jsonb,
    pgTable,
    timestamp,
    varchar,
    text,
    uuid,
    boolean,
    integer,
    pgEnum,
    primaryKey,
    unique
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
// ===================================================================
// ENUMS
// ===================================================================
export const userRoleEnum = pgEnum('user_role', ['admin', 'creator', 'user', 'guest']);
export const tenantPlanEnum = pgEnum('tenant_plan', ['free', 'pro', 'enterprise']);
export const userTenantRoleEnum = pgEnum('user_tenant_role', ['owner', 'builder', 'runner', 'viewer']);
export const authProviderEnum = pgEnum('auth_provider', ['local', 'google', 'github', 'email']);
export const organizationRoleEnum = pgEnum('organization_role', ['admin', 'member']);
export const organizationInviteStatusEnum = pgEnum('organization_invite_status', ['pending', 'accepted', 'expired', 'revoked']);
export const ownerTypeEnum = pgEnum('owner_type', ['user', 'org']);
export const anonymousAccessTypeEnum = pgEnum('anonymous_access_type', ['disabled', 'unlimited', 'one_per_ip', 'one_per_session']);
export const workspaceRoleEnum = pgEnum('workspace_role', ['owner', 'admin', 'editor', 'contributor', 'viewer']);
// Types for ACL (Access Control Lists)
export type AccessRole = "owner" | "edit" | "view" | "none";
export type PrincipalType = "user" | "org"; // Maps to ownerTypeEnum but as strict string union if needed, or alias ownerTypeEnum
// ===================================================================
// TABLES
// ===================================================================
// Tenants (Platform Level - Billing/Instance)
export const tenants = pgTable("tenants", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    billingEmail: varchar("billing_email", { length: 255 }),
    plan: tenantPlanEnum("plan").default('free').notNull(),
    mfaRequired: boolean("mfa_required").default(false).notNull(),
    branding: jsonb("branding"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("tenants_plan_idx").on(table.plan),
]);
// Users table (Central identity)
export const users = pgTable("users", {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    email: varchar("email", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 255 }),
    firstName: varchar("first_name", { length: 255 }),
    lastName: varchar("last_name", { length: 255 }),
    profileImageUrl: varchar("profile_image_url", { length: 500 }),
    // avatarUrl removed as it does not exist in DB and is unused legacy
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }),
    role: userRoleEnum("role").default('creator').notNull(),
    tenantRole: userTenantRoleEnum("tenant_role"),
    authProvider: authProviderEnum("auth_provider").default('local').notNull(),
    defaultMode: text("default_mode").default('easy').notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
    lastPasswordChange: timestamp("last_password_change"),
    isPlaceholder: boolean("is_placeholder").default(false).notNull(),
    placeholderEmail: varchar("placeholder_email", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    // lastLoginAt: timestamp("last_login_at"), // Temporarily removed to fix test DB mismatch
}, (table) => [
    index("users_email_idx").on(table.email),
    index("users_tenant_idx").on(table.tenantId),
    index("users_tenant_email_idx").on(table.tenantId, table.email),
    index("idx_users_is_placeholder").on(table.isPlaceholder),
    index("idx_users_placeholder_email").on(table.placeholderEmail),
]);
// Organizations (Customer Level - scoped to Tenant)
export const organizations = pgTable("organizations", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name").notNull(),
    description: text("description"),
    slug: varchar("slug").unique(),
    domain: varchar("domain"),
    settings: jsonb("settings").default({}),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: 'set null' }),
    // ownerId: varchar("owner_id").references(() => users.id), // Added for compatibility - Temporarily removed for test DB mismatch
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("idx_organizations_created_by").on(table.createdByUserId),
    index("idx_organizations_tenant").on(table.tenantId),
]);
// Organization Memberships
export const organizationMemberships = pgTable("organization_memberships", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    role: organizationRoleEnum("role").default('member').notNull(),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    uniqueIndex("org_membership_unique_idx").on(table.orgId, table.userId),
    index("idx_org_memberships_org").on(table.orgId),
    index("idx_org_memberships_user").on(table.userId),
    index("idx_org_memberships_role").on(table.role),
]);
// Organization Invites
export const organizationInvites = pgTable("organization_invites", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    invitedEmail: varchar("invited_email", { length: 255 }).notNull(),
    invitedUserId: varchar("invited_user_id").references(() => users.id, { onDelete: 'cascade' }),
    invitedByUserId: varchar("invited_by_user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    status: organizationInviteStatusEnum("status").default('pending').notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    emailSentAt: timestamp("email_sent_at"),
    emailFailed: boolean("email_failed").default(false),
    emailError: text("email_error"),
}, (table) => [
    uniqueIndex("org_invites_token_unique_idx").on(table.token),
    index("idx_org_invites_org_email_status").on(table.orgId, table.invitedEmail, table.status),
    index("idx_org_invites_status").on(table.status),
    index("idx_org_invites_expires").on(table.expiresAt),
]);
// Workspaces
export const workspaces = pgTable("workspaces", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    name: varchar("name").notNull(),
    slug: varchar("slug").notNull(),
    settings: jsonb("settings").default({}),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    uniqueIndex("workspace_org_slug_idx").on(table.organizationId, table.slug),
]);
// Workspace Members
export const workspaceMembers = pgTable("workspace_members", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    role: workspaceRoleEnum("role").default('viewer').notNull(),
    joinedAt: timestamp("joined_at").defaultNow(),
    invitedBy: varchar("invited_by").references(() => users.id),
}, (table) => [
    uniqueIndex("workspace_member_idx").on(table.workspaceId, table.userId),
]);
// Workspace Invitations
export const workspaceInvitations = pgTable("workspace_invitations", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
    email: varchar("email").notNull(),
    role: workspaceRoleEnum("role").default('viewer').notNull(),
    token: varchar("token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    invitedBy: varchar("invited_by").references(() => users.id).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("invitation_token_idx").on(table.token),
    index("invitation_ws_email_idx").on(table.workspaceId, table.email),
]);
// Tenant Domains
export const tenantDomains = pgTable("tenant_domains", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    domain: text("domain").notNull().unique(),
    verified: boolean("verified").default(false),
    verificationToken: varchar("verification_token"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("tenant_domains_tenant_idx").on(table.tenantId),
    index("tenant_domains_domain_idx").on(table.domain),
]);
// User Credentials (Local Auth)
export const userCredentials = pgTable("user_credentials", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("user_credentials_user_idx").on(table.userId),
]);
// Refresh Tokens
export const refreshTokens = pgTable("refresh_tokens", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    token: varchar("token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revoked: boolean("revoked").default(false).notNull(),
    metadata: jsonb("metadata"),
    deviceName: varchar("device_name", { length: 255 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    location: varchar("location", { length: 255 }),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("refresh_token_user_idx").on(table.userId),
    index("refresh_token_token_idx").on(table.token),
]);
// Password Reset Tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    token: varchar("token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    used: boolean("used").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("pwd_reset_token_idx").on(table.token),
    index("pwd_reset_user_idx").on(table.userId),
]);
// Email Verification Tokens
export const emailVerificationTokens = pgTable("email_verification_tokens", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    token: varchar("token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("email_verify_token_idx").on(table.token),
    index("email_verify_user_idx").on(table.userId),
]);
// Security: Login Attempts
export const loginAttempts = pgTable("login_attempts", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: varchar("email", { length: 255 }).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    successful: boolean("successful").notNull().default(false),
    attemptedAt: timestamp("attempted_at").notNull().defaultNow(),
}, (table) => [
    index("login_attempts_email_idx").on(table.email),
    index("login_attempts_timestamp_idx").on(table.attemptedAt),
]);
// Security: Account Locks
export const accountLocks = pgTable("account_locks", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    lockedAt: timestamp("locked_at").notNull().defaultNow(),
    lockedUntil: timestamp("locked_until").notNull(),
    reason: varchar("reason", { length: 255 }),
    unlocked: boolean("unlocked").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
    index("account_locks_user_idx").on(table.userId),
    index("account_locks_until_idx").on(table.lockedUntil),
]);
// MFA Secrets
export const mfaSecrets = pgTable("mfa_secrets", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
    secret: text("secret").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    enabledAt: timestamp("enabled_at"),
}, (table) => [
    index("mfa_secrets_user_idx").on(table.userId),
]);
// MFA Backup Codes
export const mfaBackupCodes = pgTable("mfa_backup_codes", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    codeHash: text("code_hash").notNull(),
    used: boolean("used").notNull().default(false),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
    index("mfa_backup_codes_user_idx").on(table.userId),
    index("mfa_backup_codes_hash_idx").on(table.codeHash),
]);
// Trusted Devices
export const trustedDevices = pgTable("trusted_devices", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    deviceFingerprint: varchar("device_fingerprint", { length: 255 }).notNull(),
    deviceName: varchar("device_name", { length: 255 }),
    trustedUntil: timestamp("trusted_until").notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    location: varchar("location", { length: 255 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
    revoked: boolean("revoked").default(false).notNull(),
}, (table) => [
    index("trusted_devices_user_idx").on(table.userId),
    index("trusted_devices_fingerprint_idx").on(table.deviceFingerprint),
    index("trusted_devices_user_fingerprint_idx").on(table.userId, table.deviceFingerprint),
]);
// User Preferences
export const userPreferences = pgTable("user_preferences", {
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).primaryKey(),
    settings: jsonb("settings").default({
        celebrationEffects: true,
        darkMode: "system",
        aiHints: true,
    }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
// User Personalization Settings
export const userPersonalizationSettings = pgTable("user_personalization_settings", {
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).primaryKey(),
    readingLevel: varchar("reading_level", { enum: ["simple", "standard", "professional"] }).default("standard").notNull(),
    tone: varchar("tone", { enum: ["friendly", "neutral", "formal"] }).default("neutral").notNull(),
    verbosity: varchar("verbosity", { enum: ["brief", "standard", "detailed"] }).default("standard").notNull(),
    language: varchar("language").default("en").notNull(),
    allowAdaptivePrompts: boolean("allow_adaptive_prompts").default(true).notNull(),
    allowAIClarification: boolean("allow_ai_clarification").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
// Portal Authentication Tokens
export const portalTokens = pgTable("portal_tokens", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: varchar("email").notNull(),
    token: varchar("token").unique().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow(),
});
// Audit Logs
export const auditLogs = pgTable("audit_logs", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    workspaceId: uuid("workspace_id"),
    userId: varchar("user_id").references(() => users.id),
    action: varchar("action").notNull(),
    entityType: varchar("entity_type").notNull(),
    entityId: varchar("entity_id").notNull(),
    resourceType: varchar("resource_type"),
    resourceId: varchar("resource_id"),
    changes: jsonb("changes"),
    details: jsonb("details"),
    ipAddress: varchar("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow(),
    timestamp: timestamp("timestamp").defaultNow(),
}, (table) => [
    index("audit_logs_tenant_idx").on(table.tenantId),
    index("audit_logs_user_idx").on(table.userId),
    index("audit_logs_action_idx").on(table.action),
]);
// Resource Permissions (for granular RBAC)
export const resourcePermissions = pgTable("resource_permissions", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
    resourceType: varchar("resource_type").notNull(), // 'workflow', 'project'
    resourceId: varchar("resource_id").notNull(),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    action: varchar("action").notNull(), // 'view', 'edit', 'admin' (or specific capability)
    allowed: boolean("allowed").default(true).notNull(), // Can explicit deny
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    uniqueIndex("resource_perm_idx").on(table.resourceId, table.userId, table.action),
]);
// Sessions
export const sessions = pgTable("sessions", {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
}, (table) => [index("IDX_session_expire").on(table.expire)]);
// Teams
export const teams = pgTable("teams", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
    index("teams_tenant_idx").on(table.tenantId),
]);
// Team Members
export const teamMembers = pgTable("team_members", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: 'cascade' }).notNull(),
    userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    role: varchar("role", { length: 50 }).default('member').notNull(), // 'member', 'admin'
    joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
    uniqueIndex("team_members_idx").on(table.teamId, table.userId),
]);
// ===================================================================
// INSERTS & TYPES
// ===================================================================
export const insertUserSchema = createInsertSchema(users);
export const insertOrganizationSchema = createInsertSchema(organizations);
export const insertOrganizationMembershipSchema = createInsertSchema(organizationMemberships);
export const insertWorkspaceSchema = createInsertSchema(workspaces);
export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers);
export const insertWorkspaceInvitationSchema = createInsertSchema(workspaceInvitations);
export const insertAuditLogSchema = createInsertSchema(auditLogs);
export const insertUserCredentialsSchema = createInsertSchema(userCredentials);
export const insertUserPreferencesSchema = createInsertSchema(userPreferences);
export const insertUserPersonalizationSettingsSchema = createInsertSchema(userPersonalizationSettings);
export const insertTeamSchema = createInsertSchema(teams);
export const insertTeamMemberSchema = createInsertSchema(teamMembers);
export type User = InferSelectModel<typeof users>;
export type UpsertUser = InferInsertModel<typeof users>;
export type InsertUser = InferInsertModel<typeof users>;
export type Tenant = InferSelectModel<typeof tenants>;
export type Organization = InferSelectModel<typeof organizations>;
export type InsertOrganization = InferInsertModel<typeof organizations>;
export type OrganizationMembership = InferSelectModel<typeof organizationMemberships>;
export type InsertOrganizationMembership = InferInsertModel<typeof organizationMemberships>;
export type Workspace = InferSelectModel<typeof workspaces>;
export type WorkspaceMember = InferSelectModel<typeof workspaceMembers>;
export type WorkspaceInvitation = InferSelectModel<typeof workspaceInvitations>;
export type UserCredentials = InferSelectModel<typeof userCredentials>;
export type InsertUserCredentials = InferInsertModel<typeof userCredentials>;
export type UserPreferences = InferSelectModel<typeof userPreferences>;
export type InsertUserPreferences = InferInsertModel<typeof userPreferences>;
export type UserPersonalizationSettings = InferSelectModel<typeof userPersonalizationSettings>;
export type AuditLog = InferSelectModel<typeof auditLogs>;
export type InsertAuditLog = InferInsertModel<typeof auditLogs>;
export type Team = InferSelectModel<typeof teams>;
export type InsertTeam = InferInsertModel<typeof teams>;
export type TeamMember = InferSelectModel<typeof teamMembers>;
export type InsertTeamMember = InferInsertModel<typeof teamMembers>;
// Export 'Teams' placeholders if needed, but not in original. Removed for now.