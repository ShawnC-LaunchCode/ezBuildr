import { eq, and, gt } from 'drizzle-orm';

import { refreshTokens } from '@shared/schema';

import { db } from '../db';
import { createLogger } from '../logger';
import { getMeter } from '../observability/telemetry';

import type { Counter, Histogram, ObservableGauge } from '@opentelemetry/api';




const logger = createLogger({ module: 'metrics-service' });

/**
 * MetricsService - Authentication and session metrics tracking
 * Provides OpenTelemetry metrics for monitoring authentication operations
 */
class MetricsService {
  private meter = getMeter();

  // Authentication Metrics
  private loginAttemptCounter: Counter;
  private mfaEventCounter: Counter;
  private sessionOperationCounter: Counter;
  private authLatencyHistogram: Histogram;
  private activeSessionsGauge: ObservableGauge;

  constructor() {
    // Counter for login attempts (success, failure, mfa_required)
    this.loginAttemptCounter = this.meter.createCounter('auth.login.attempts', {
      description: 'Total number of login attempts',
      unit: '1',
    });

    // Counter for MFA events (enabled, disabled, verified)
    this.mfaEventCounter = this.meter.createCounter('auth.mfa.events', {
      description: 'MFA-related events',
      unit: '1',
    });

    // Counter for session operations (created, refreshed, revoked)
    this.sessionOperationCounter = this.meter.createCounter('auth.session.operations', {
      description: 'Session management operations',
      unit: '1',
    });

    // Histogram for auth endpoint latency
    this.authLatencyHistogram = this.meter.createHistogram('auth.endpoint.duration', {
      description: 'Duration of authentication operations',
      unit: 'ms',
    });

    // Gauge for active sessions (observable - polls database)
    this.activeSessionsGauge = this.meter.createObservableGauge('auth.sessions.active', {
      description: 'Number of currently active sessions',
      unit: '1',
    });

    // Callback to observe active sessions
    this.activeSessionsGauge.addCallback(async (observableResult) => {
      try {
        const activeSessions = await db.query.refreshTokens.findMany({
          where: and(
            eq(refreshTokens.revoked, false),
            gt(refreshTokens.expiresAt, new Date())
          ),
        });

        observableResult.observe(activeSessions.length);
      } catch (error) {
        logger.error({ error }, 'Error observing active sessions count');
        observableResult.observe(0);
      }
    });

    logger.info('MetricsService initialized');
  }

  /**
   * Record a login attempt
   * @param status - 'success' | 'failure' | 'mfa_required' | 'account_locked' | 'email_not_verified'
   * @param provider - Authentication provider (e.g., 'local', 'google', 'oauth')
   */
  recordLoginAttempt(status: string, provider: string = 'local') {
    try {
      this.loginAttemptCounter.add(1, {
        status,
        provider,
      });
    } catch (error) {
      logger.error({ error, status, provider }, 'Error recording login attempt metric');
    }
  }

  /**
   * Record an MFA event
   * @param event - 'enabled' | 'disabled' | 'verified' | 'backup_code_used' | 'backup_codes_regenerated'
   * @param userId - Optional user ID for debugging
   */
  recordMfaEvent(event: string, userId?: string) {
    try {
      const attributes: Record<string, string> = { event };
      if (userId) {
        attributes.userId = userId;
      }

      this.mfaEventCounter.add(1, attributes);
    } catch (error) {
      logger.error({ error, event, userId }, 'Error recording MFA event metric');
    }
  }

  /**
   * Record a session operation
   * @param operation - 'created' | 'refreshed' | 'revoked' | 'expired'
   * @param userId - Optional user ID for debugging
   */
  recordSessionOperation(operation: string, userId?: string) {
    try {
      const attributes: Record<string, string> = { operation };
      if (userId) {
        attributes.userId = userId;
      }

      this.sessionOperationCounter.add(1, attributes);
    } catch (error) {
      logger.error({ error, operation, userId }, 'Error recording session operation metric');
    }
  }

  /**
   * Record authentication endpoint latency
   * @param startTime - Start timestamp (from Date.now())
   * @param endpoint - Endpoint name (e.g., 'login', 'refresh', 'logout', 'mfa_verify')
   * @param status - HTTP status code or 'success'/'error'
   */
  recordAuthLatency(startTime: number, endpoint: string, status: number | string = 'success') {
    try {
      const duration = Date.now() - startTime;

      this.authLatencyHistogram.record(duration, {
        endpoint,
        status: String(status),
      });
    } catch (error) {
      logger.error({ error, endpoint, status }, 'Error recording auth latency metric');
    }
  }

  /**
   * Record registration event
   * @param status - 'success' | 'failure'
   * @param provider - Authentication provider
   */
  recordRegistration(status: string, provider: string = 'local') {
    try {
      this.loginAttemptCounter.add(1, {
        status: `registration_${status}`,
        provider,
      });
    } catch (error) {
      logger.error({ error, status, provider }, 'Error recording registration metric');
    }
  }

  /**
   * Record password reset event
   * @param event - 'requested' | 'completed' | 'failed'
   */
  recordPasswordReset(event: string) {
    try {
      this.sessionOperationCounter.add(1, {
        operation: `password_reset_${event}`,
      });
    } catch (error) {
      logger.error({ error, event }, 'Error recording password reset metric');
    }
  }

  /**
   * Record email verification event
   * @param event - 'sent' | 'verified' | 'failed'
   */
  recordEmailVerification(event: string) {
    try {
      this.sessionOperationCounter.add(1, {
        operation: `email_verification_${event}`,
      });
    } catch (error) {
      logger.error({ error, event }, 'Error recording email verification metric');
    }
  }

  /**
   * Record trusted device event
   * @param event - 'added' | 'revoked' | 'used'
   */
  recordTrustedDevice(event: string) {
    try {
      this.mfaEventCounter.add(1, {
        event: `trusted_device_${event}`,
      });
    } catch (error) {
      logger.error({ error, event }, 'Error recording trusted device metric');
    }
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
