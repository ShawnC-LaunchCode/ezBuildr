import { eq, and, desc, sql } from "drizzle-orm";

import { auditLogs, type AuditLog } from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";

const logger = createLogger({ module: "audit-log-service" });

/**
 * Security event types for authentication and authorization
 */
export enum SecurityEventType {
  LOGIN_SUCCESS = "login_success",
  LOGIN_FAILED = "login_failed",
  LOGOUT = "logout",
  MFA_ENABLED = "mfa_enabled",
  MFA_DISABLED = "mfa_disabled",
  PASSWORD_CHANGED = "password_changed",
  PASSWORD_RESET = "password_reset",
  EMAIL_VERIFIED = "email_verified",
  SESSION_CREATED = "session_created",
  SESSION_REVOKED = "session_revoked",
  ALL_SESSIONS_REVOKED = "all_sessions_revoked",
  TRUSTED_DEVICE_ADDED = "trusted_device_added",
  TRUSTED_DEVICE_REVOKED = "trusted_device_revoked",
  ACCOUNT_LOCKED = "account_locked",
  ACCOUNT_UNLOCKED = "account_unlocked",
}

/**
 * Interface for security event metadata
 */
interface SecurityEventMetadata {
  [key: string]: any;
  reason?: string;
  deviceFingerprint?: string;
  sessionId?: string;
  failureReason?: string;
  mfaMethod?: string;
  deviceName?: string;
  location?: string;
}

/**
 * Interface for audit log creation
 */
interface CreateAuditLogParams {
  userId: string;
  eventType: SecurityEventType;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: SecurityEventMetadata;
  workspaceId?: string | null;
}

/**
 * Interface for retrieving audit logs
 */
interface GetAuditLogsOptions {
  limit?: number;
  offset?: number;
  eventTypes?: SecurityEventType[];
}

/**
 * AuditLogService handles comprehensive security event logging
 * for authentication, authorization, and user security actions.
 */
export class AuditLogService {
  /**
   * Log a security event
   * @param params - Event details including userId, eventType, IP, userAgent, and metadata
   * @returns The created audit log entry
   */
  async logSecurityEvent(params: CreateAuditLogParams): Promise<AuditLog> {
    const { userId, eventType, ipAddress, userAgent, metadata, workspaceId } = params;

    try {
      // For security events, we'll use a default workspace or null
      // Since the schema requires workspaceId, we'll use a system workspace concept
      // or make it nullable in a future migration. For now, we'll handle gracefully.
      const auditEntry = {
        workspaceId: workspaceId || sql`NULL`, // Will need schema update to make nullable
        userId,
        action: eventType,
        resourceType: "security",
        resourceId: userId,
        changes: metadata ? { metadata } : null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        timestamp: new Date(),
      };

      const [result] = await db.insert(auditLogs).values(auditEntry).returning();

      logger.info(
        {
          userId,
          eventType,
          ipAddress,
          hasMetadata: !!metadata,
        },
        "Security event logged"
      );

      return result;
    } catch (error) {
      logger.error(
        {
          error,
          userId,
          eventType,
        },
        "Failed to log security event"
      );
      throw error;
    }
  }

  /**
   * Log a login attempt (success or failure)
   * @param userId - User ID attempting to log in
   * @param success - Whether login was successful
   * @param ipAddress - IP address of the request
   * @param userAgent - User agent string
   * @param failureReason - Optional reason for failure
   */
  async logLoginAttempt(
    userId: string,
    success: boolean,
    ipAddress?: string | null,
    userAgent?: string | null,
    failureReason?: string
  ): Promise<AuditLog> {
    const eventType = success
      ? SecurityEventType.LOGIN_SUCCESS
      : SecurityEventType.LOGIN_FAILED;

    const metadata: SecurityEventMetadata = success
      ? { timestamp: new Date().toISOString() }
      : { failureReason: failureReason || "Invalid credentials" };

    return this.logSecurityEvent({
      userId,
      eventType,
      ipAddress,
      userAgent,
      metadata,
    });
  }

  /**
   * Log a logout event
   * @param userId - User ID logging out
   * @param ipAddress - IP address of the request
   * @param userAgent - User agent string
   */
  async logLogout(
    userId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<AuditLog> {
    return this.logSecurityEvent({
      userId,
      eventType: SecurityEventType.LOGOUT,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log a password change event
   * @param userId - User ID changing password
   * @param ipAddress - IP address of the request
   * @param userAgent - User agent string
   */
  async logPasswordChange(
    userId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<AuditLog> {
    return this.logSecurityEvent({
      userId,
      eventType: SecurityEventType.PASSWORD_CHANGED,
      ipAddress,
      userAgent,
      metadata: { timestamp: new Date().toISOString() },
    });
  }

  /**
   * Log a password reset event
   * @param userId - User ID resetting password
   * @param ipAddress - IP address of the request
   * @param userAgent - User agent string
   */
  async logPasswordReset(
    userId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<AuditLog> {
    return this.logSecurityEvent({
      userId,
      eventType: SecurityEventType.PASSWORD_RESET,
      ipAddress,
      userAgent,
      metadata: { timestamp: new Date().toISOString() },
    });
  }

  /**
   * Log an MFA change event (enable/disable)
   * @param userId - User ID changing MFA status
   * @param enabled - Whether MFA is being enabled or disabled
   * @param ipAddress - IP address of the request
   * @param userAgent - User agent string
   * @param mfaMethod - Optional MFA method (e.g., "totp", "sms")
   */
  async logMfaChange(
    userId: string,
    enabled: boolean,
    ipAddress?: string | null,
    userAgent?: string | null,
    mfaMethod?: string
  ): Promise<AuditLog> {
    const eventType = enabled
      ? SecurityEventType.MFA_ENABLED
      : SecurityEventType.MFA_DISABLED;

    return this.logSecurityEvent({
      userId,
      eventType,
      ipAddress,
      userAgent,
      metadata: {
        mfaMethod: mfaMethod || "totp",
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Log an email verification event
   * @param userId - User ID verifying email
   * @param ipAddress - IP address of the request
   * @param userAgent - User agent string
   */
  async logEmailVerified(
    userId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<AuditLog> {
    return this.logSecurityEvent({
      userId,
      eventType: SecurityEventType.EMAIL_VERIFIED,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log a session event (created, revoked, all revoked)
   * @param userId - User ID
   * @param eventType - Type of session event
   * @param sessionId - Optional session ID
   * @param ipAddress - IP address of the request
   * @param userAgent - User agent string
   */
  async logSessionEvent(
    userId: string,
    eventType:
      | SecurityEventType.SESSION_CREATED
      | SecurityEventType.SESSION_REVOKED
      | SecurityEventType.ALL_SESSIONS_REVOKED,
    sessionId?: string | null,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<AuditLog> {
    return this.logSecurityEvent({
      userId,
      eventType,
      ipAddress,
      userAgent,
      metadata: sessionId ? { sessionId } : undefined,
    });
  }

  /**
   * Log a trusted device event (added/revoked)
   * @param userId - User ID
   * @param added - Whether device was added (true) or revoked (false)
   * @param deviceFingerprint - Device fingerprint
   * @param deviceName - Human-readable device name
   * @param ipAddress - IP address of the request
   * @param userAgent - User agent string
   * @param location - Optional location
   */
  async logTrustedDeviceEvent(
    userId: string,
    added: boolean,
    deviceFingerprint: string,
    deviceName?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
    location?: string
  ): Promise<AuditLog> {
    const eventType = added
      ? SecurityEventType.TRUSTED_DEVICE_ADDED
      : SecurityEventType.TRUSTED_DEVICE_REVOKED;

    return this.logSecurityEvent({
      userId,
      eventType,
      ipAddress,
      userAgent,
      metadata: {
        deviceFingerprint,
        deviceName,
        location,
      },
    });
  }

  /**
   * Log an account lockout event
   * @param userId - User ID
   * @param locked - Whether account is locked (true) or unlocked (false)
   * @param reason - Reason for lock/unlock
   * @param ipAddress - IP address of the request
   */
  async logAccountLockout(
    userId: string,
    locked: boolean,
    reason: string,
    ipAddress?: string | null
  ): Promise<AuditLog> {
    const eventType = locked
      ? SecurityEventType.ACCOUNT_LOCKED
      : SecurityEventType.ACCOUNT_UNLOCKED;

    return this.logSecurityEvent({
      userId,
      eventType,
      ipAddress,
      userAgent: null,
      metadata: { reason },
    });
  }

  /**
   * Retrieve audit logs for a specific user
   * @param userId - User ID to retrieve logs for
   * @param options - Pagination and filtering options
   * @returns Array of audit logs
   */
  async getAuditLogsForUser(
    userId: string,
    options: GetAuditLogsOptions = {}
  ): Promise<AuditLog[]> {
    const { limit = 50, offset = 0, eventTypes } = options;

    try {
      let query = db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, userId),
            eq(auditLogs.resourceType, "security")
          )
        )
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit)
        .offset(offset);

      // Apply event type filter if provided
      if (eventTypes && eventTypes.length > 0) {
        query = db
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.userId, userId),
              eq(auditLogs.resourceType, "security"),
              sql`${auditLogs.action} IN (${sql.join(eventTypes.map((t) => sql`${t}`), sql`, `)})`
            )
          )
          .orderBy(desc(auditLogs.timestamp))
          .limit(limit)
          .offset(offset);
      }

      const logs = await query;

      logger.info(
        {
          userId,
          count: logs.length,
          limit,
          offset,
        },
        "Retrieved audit logs for user"
      );

      return logs;
    } catch (error) {
      logger.error(
        {
          error,
          userId,
        },
        "Failed to retrieve audit logs"
      );
      throw error;
    }
  }

  /**
   * Count total audit logs for a user
   * @param userId - User ID
   * @param eventTypes - Optional filter by event types
   * @returns Total count of logs
   */
  async countAuditLogsForUser(
    userId: string,
    eventTypes?: SecurityEventType[]
  ): Promise<number> {
    try {
      let query = db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, userId),
            eq(auditLogs.resourceType, "security")
          )
        );

      if (eventTypes && eventTypes.length > 0) {
        query = db
          .select({ count: sql<number>`count(*)` })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.userId, userId),
              eq(auditLogs.resourceType, "security"),
              sql`${auditLogs.action} IN (${sql.join(eventTypes.map((t) => sql`${t}`), sql`, `)})`
            )
          );
      }

      const [result] = await query;
      return Number(result?.count || 0);
    } catch (error) {
      logger.error(
        {
          error,
          userId,
        },
        "Failed to count audit logs"
      );
      throw error;
    }
  }

  /**
   * Get recent security events across all users (admin function)
   * @param limit - Maximum number of logs to retrieve
   * @param offset - Pagination offset
   * @returns Array of audit logs
   */
  async getRecentSecurityEvents(
    limit: number = 100,
    offset: number = 0
  ): Promise<AuditLog[]> {
    try {
      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceType, "security"))
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit)
        .offset(offset);

      logger.info(
        {
          count: logs.length,
          limit,
          offset,
        },
        "Retrieved recent security events"
      );

      return logs;
    } catch (error) {
      logger.error({ error }, "Failed to retrieve recent security events");
      throw error;
    }
  }
}

/**
 * Singleton instance of AuditLogService
 */
export const auditLogService = new AuditLogService();
