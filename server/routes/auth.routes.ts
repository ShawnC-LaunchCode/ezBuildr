import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit"; // Import rateLimit
import type { User } from "@shared/schema";
import { userRepository, userCredentialsRepository } from "../repositories";
import { createLogger } from "../logger";
import { authService } from "../services/AuthService";
import { accountLockoutService } from "../services/AccountLockoutService";
import { mfaService } from "../services/MfaService";
import { hybridAuth, optionalHybridAuth, type AuthRequest } from "../middleware/auth";
import { parseCookies } from "../utils/cookies"; // Import parseCookies
import { generateDeviceFingerprint, parseDeviceName, getLocationFromIP } from "../utils/deviceFingerprint";
import { nanoid } from "nanoid";
import { serialize } from "cookie";
import { db } from "../db";
import { refreshTokens, trustedDevices } from "@shared/schema";
import { eq, and, gt, ne, desc } from "drizzle-orm";

const logger = createLogger({ module: 'auth-routes' });

// SECURITY FIX: Rate limiting for password-based authentication
// Disable rate limiting in test environment to prevent flaky tests
const isTest = process.env.NODE_ENV === 'test';

const authRateLimit = isTest ?
  (req: Request, res: Response, next: any) => next() :
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per windowMs
    message: { message: "Too many login/register attempts, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

/**
 * Register authentication-related routes
 */
export function registerAuthRoutes(app: Express): void {

  /**
   * POST /api/auth/register
   */
  app.post('/api/auth/register', authRateLimit, async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName, tenantId, tenantRole } = req.body;

      if (!email || !password) return res.status(400).json({ message: 'Email and password required', error: 'missing_fields' });
      if (!authService.validateEmail(email)) return res.status(400).json({ message: 'Invalid email format', error: 'invalid_email' });

      const pwdValidation = authService.validatePasswordStrength(password);
      if (!pwdValidation.valid) return res.status(400).json({ message: pwdValidation.message, error: 'weak_password' });

      const existingUser = await userRepository.findByEmail(email);
      if (existingUser) return res.status(409).json({ message: 'User already exists', error: 'user_exists' });

      const userId = nanoid();
      const user = await userRepository.create({
        id: userId,
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        fullName: firstName && lastName ? `${firstName} ${lastName}` : null,
        profileImageUrl: null,
        tenantId: tenantId || null,
        role: 'creator',
        tenantRole: tenantRole || null,
        authProvider: 'local',
        defaultMode: 'easy',
      });

      const passwordHash = await authService.hashPassword(password);
      await userCredentialsRepository.createCredentials(userId, passwordHash);

      // Enterprise: Email Verification
      await authService.generateEmailVerificationToken(userId, email);

      const token = authService.createToken(user);
      const refreshToken = await authService.createRefreshToken(userId, { ip: req.ip, userAgent: req.headers['user-agent'] });

      res.setHeader('Set-Cookie', serialize('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 * 30
      }));

      logger.info({ userId: user.id, email: user.email }, 'User registered');

      res.status(201).json({
        message: 'Registration successful. Please verify your email.',
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          tenantId: user.tenantId,
          role: user.tenantRole,
          emailVerified: user.emailVerified
        },
      });
    } catch (error) {
      logger.error({ error }, 'Registration failed');
      res.status(500).json({ message: 'Registration failed', error: 'internal_error' });
    }
  });

  /**
   * POST /api/auth/login
   */
  app.post('/api/auth/login', authRateLimit, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: 'Email and password required', error: 'missing_fields' });

      const user = await userRepository.findByEmail(email);
      if (!user) {
        // Record failed attempt even if user doesn't exist (prevents enumeration)
        await accountLockoutService.recordAttempt(email, req.ip, false);
        return res.status(401).json({ message: 'Invalid credentials', error: 'invalid_credentials' });
      }

      // CHECK ACCOUNT LOCK
      const lockStatus = await accountLockoutService.isAccountLocked(user.id);
      if (lockStatus.locked) {
        const minutesRemaining = Math.ceil((lockStatus.lockedUntil!.getTime() - Date.now()) / 60000);
        logger.warn({ userId: user.id, email }, 'Login blocked: account locked');
        return res.status(423).json({
          message: `Account temporarily locked due to too many failed login attempts. Try again in ${minutesRemaining} minutes.`,
          error: 'account_locked',
          lockedUntil: lockStatus.lockedUntil
        });
      }

      if (user.authProvider !== 'local') {
        return res.status(400).json({ message: `Please sign in with ${user.authProvider}`, error: 'wrong_auth_provider' });
      }

      const credentials = await userCredentialsRepository.findByUserId(user.id);
      if (!credentials) {
        await accountLockoutService.recordAttempt(email, req.ip, false);
        return res.status(401).json({ message: 'Invalid credentials', error: 'invalid_credentials' });
      }

      const isMatch = await authService.comparePassword(password, credentials.passwordHash);
      if (!isMatch) {
        // RECORD FAILED ATTEMPT
        await accountLockoutService.recordAttempt(email, req.ip, false);
        return res.status(401).json({ message: 'Invalid credentials', error: 'invalid_credentials' });
      }

      // Email verification enforcement
      if (!user.emailVerified) {
        logger.warn({ userId: user.id, email: user.email }, 'Login blocked: email not verified');
        return res.status(403).json({
          message: 'Please verify your email before logging in. Check your inbox for the verification link.',
          error: 'email_not_verified',
          email: user.email
        });
      }

      // RECORD SUCCESSFUL ATTEMPT
      await accountLockoutService.recordAttempt(email, req.ip, true);

      // MFA CHECK: If user has MFA enabled, check if device is trusted
      if (user.mfaEnabled) {
        const deviceFingerprint = generateDeviceFingerprint(req);

        // Check if device is trusted
        const trustedDevice = await db.query.trustedDevices.findFirst({
          where: and(
            eq(trustedDevices.userId, user.id),
            eq(trustedDevices.deviceFingerprint, deviceFingerprint),
            eq(trustedDevices.revoked, false),
            gt(trustedDevices.trustedUntil, new Date())
          )
        });

        if (trustedDevice) {
          // Update last used timestamp
          await db.update(trustedDevices)
            .set({ lastUsedAt: new Date() })
            .where(eq(trustedDevices.id, trustedDevice.id));

          logger.info({ userId: user.id }, 'Login from trusted device - MFA skipped');
        } else {
          // Device not trusted - require MFA
          logger.info({ userId: user.id }, 'Login requires MFA verification');
          return res.status(200).json({
            message: 'MFA required',
            requiresMfa: true,
            userId: user.id, // Client needs this to verify MFA
            error: 'mfa_required'
          });
        }
      }

      const token = authService.createToken(user);
      const refreshToken = await authService.createRefreshToken(user.id, { ip: req.ip, userAgent: req.headers['user-agent'] });

      res.setHeader('Set-Cookie', serialize('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 * 30
      }));

      logger.info({ userId: user.id }, 'User logged in successfully');

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          tenantId: user.tenantId,
          role: user.tenantRole,
          emailVerified: user.emailVerified,
          mfaEnabled: user.mfaEnabled
        },
      });
    } catch (error) {
      logger.error({ error }, 'Login failed');
      res.status(500).json({ message: 'Login failed', error: 'internal_error' });
    }
  });

  /**
   * POST /api/auth/refresh-token
   */
  app.post('/api/auth/refresh-token', async (req: Request, res: Response) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const refreshToken = cookies['refresh_token'];

      if (!refreshToken) return res.status(401).json({ message: 'Refresh token missing' });

      const result = await authService.rotateRefreshToken(refreshToken);

      if (!result) {
        res.setHeader('Set-Cookie', serialize('refresh_token', '', { path: '/', maxAge: 0 }));
        return res.status(401).json({ message: 'Invalid refresh token' });
      }

      const user = await userRepository.findById(result.userId);
      if (!user) return res.status(401).json({ message: 'User not found' });

      const newAccessToken = authService.createToken(user);

      res.setHeader('Set-Cookie', serialize('refresh_token', result.newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 * 30
      }));

      res.json({
        token: newAccessToken,
        user: { id: user.id, email: user.email, role: user.tenantRole }
      });
    } catch (error) {
      logger.error({ error }, 'Refresh token failed');
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  /**
   * POST /api/auth/forgot-password
   */
  app.post('/api/auth/forgot-password', authRateLimit, async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    try {
      await authService.generatePasswordResetToken(email);
      res.json({ message: "If an account exists, a reset link has been sent." });
    } catch (error) {
      logger.error({ error }, "Forgot password error");
      res.status(500).json({ message: "Internal error" });
    }
  });

  /**
   * POST /api/auth/reset-password
   */
  app.post('/api/auth/reset-password', authRateLimit, async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ message: "Token and password required" });

    try {
      const pwdValidation = authService.validatePasswordStrength(newPassword);
      if (!pwdValidation.valid) return res.status(400).json({ message: pwdValidation.message });

      const userId = await authService.verifyPasswordResetToken(token);
      if (!userId) return res.status(400).json({ message: "Invalid token" });

      const passwordHash = await authService.hashPassword(newPassword);
      await userCredentialsRepository.updatePassword(userId, passwordHash);
      await authService.revokeAllUserTokens(userId);
      await authService.consumePasswordResetToken(token);

      res.json({ message: "Password updated successfully." });
    } catch (error) {
      logger.error({ error }, "Reset password error");
      res.status(500).json({ message: "Internal error" });
    }
  });

  /**
   * POST /api/auth/verify-email
   */
  app.post('/api/auth/verify-email', authRateLimit, async (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "Token required" });

    try {
      const success = await authService.verifyEmail(token);
      if (!success) return res.status(400).json({ message: "Invalid or expired token" });
      res.json({ message: "Email verified successfully" });
    } catch (error) {
      logger.error({ error }, "Email verification error");
      res.status(500).json({ message: "Internal error" });
    }
  });

  /**
   * POST /api/auth/resend-verification
   */
  app.post('/api/auth/resend-verification', authRateLimit, async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    try {
      const user = await userRepository.findByEmail(email);

      // Don't reveal if user exists (security best practice)
      if (!user) {
        return res.json({ message: "If an account exists with that email, a verification email has been sent." });
      }

      if (user.emailVerified) {
        return res.status(400).json({ message: "Email already verified" });
      }

      // Generate and send new verification token
      await authService.generateEmailVerificationToken(user.id, user.email);

      res.json({ message: "Verification email sent. Please check your inbox." });
    } catch (error) {
      logger.error({ error }, "Resend verification error");
      res.status(500).json({ message: "Internal error" });
    }
  });

  /**
   * GET /api/auth/me
   */
  app.get('/api/auth/me', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const user = await userRepository.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        profileImageUrl: user.profileImageUrl,
        tenantId: user.tenantId,
        role: user.tenantRole,
        authProvider: user.authProvider,
        defaultMode: user.defaultMode,
      });
    } catch (error) {
      logger.error({ error }, "Error fetching me");
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  /**
   * POST /api/auth/logout
   */
  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = cookies['refresh_token'];

    if (refreshToken) await authService.revokeRefreshToken(refreshToken);

    res.setHeader('Set-Cookie', serialize('refresh_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0
    }));

    res.json({ message: 'Logout successful' });
  });

  // CSRF Deprecation Stub
  app.get('/api/auth/csrf-token', (req, res) => {
    res.json({ csrfToken: "deprecated-no-csrf-needed" });
  });

  // Cookie-to-Token Exchange (for WebSockets/etc)
  app.get('/api/auth/token', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });

      const user = await userRepository.findById(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const token = authService.createToken(user);
      res.json({ token, expiresIn: '15m' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to generate token' });
    }
  });

  // =================================================================
  // MULTI-FACTOR AUTHENTICATION (MFA)
  // =================================================================

  /**
   * POST /api/auth/mfa/setup
   * Generate TOTP secret and QR code for MFA setup
   */
  app.post('/api/auth/mfa/setup', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const user = await userRepository.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Check if MFA is already enabled
      if (user.mfaEnabled) {
        return res.status(400).json({
          message: "MFA is already enabled. Disable it first to set up again.",
          error: "mfa_already_enabled"
        });
      }

      // Generate TOTP secret, QR code, and backup codes
      const { qrCodeDataUrl, backupCodes } = await mfaService.generateTotpSecret(userId, user.email);

      logger.info({ userId }, 'MFA setup initiated');

      res.json({
        message: "Scan this QR code with your authenticator app",
        qrCodeDataUrl,
        backupCodes
      });
    } catch (error) {
      logger.error({ error }, 'MFA setup error');
      res.status(500).json({ message: "Failed to generate MFA setup" });
    }
  });

  /**
   * POST /api/auth/mfa/verify
   * Verify TOTP code and enable MFA
   */
  app.post('/api/auth/mfa/verify', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { token } = req.body;
      if (!token) return res.status(400).json({ message: "TOTP token required" });

      const success = await mfaService.verifyAndEnableMfa(userId, token);

      if (!success) {
        return res.status(400).json({
          message: "Invalid TOTP code. Please try again.",
          error: "invalid_totp"
        });
      }

      logger.info({ userId }, 'MFA enabled successfully');

      res.json({ message: "MFA enabled successfully" });
    } catch (error) {
      logger.error({ error }, 'MFA verification error');
      res.status(500).json({ message: "Failed to verify MFA" });
    }
  });

  /**
   * POST /api/auth/mfa/verify-login
   * Verify MFA during login
   */
  app.post('/api/auth/mfa/verify-login', authRateLimit, async (req: Request, res: Response) => {
    try {
      const { userId, token, backupCode } = req.body;

      if (!userId) return res.status(400).json({ message: "User ID required" });

      const user = await userRepository.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      let verified = false;

      // Try TOTP first
      if (token) {
        verified = await mfaService.verifyTotp(userId, token);
      }

      // Try backup code if TOTP failed or not provided
      if (!verified && backupCode) {
        verified = await mfaService.verifyBackupCode(userId, backupCode);
      }

      if (!verified) {
        logger.warn({ userId }, 'MFA verification failed during login');
        return res.status(401).json({
          message: "Invalid authentication code",
          error: "invalid_mfa_code"
        });
      }

      // Generate tokens
      const accessToken = authService.createToken(user);
      const refreshToken = await authService.createRefreshToken(userId, {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.setHeader('Set-Cookie', serialize('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 * 30
      }));

      logger.info({ userId }, 'MFA login successful');

      res.json({
        message: 'Login successful',
        token: accessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          tenantId: user.tenantId,
          role: user.tenantRole,
          emailVerified: user.emailVerified,
          mfaEnabled: user.mfaEnabled
        }
      });
    } catch (error) {
      logger.error({ error }, 'MFA login verification error');
      res.status(500).json({ message: "Internal error" });
    }
  });

  /**
   * GET /api/auth/mfa/status
   * Check MFA status for current user
   */
  app.get('/api/auth/mfa/status', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const mfaEnabled = await mfaService.isMfaEnabled(userId);
      const backupCodesRemaining = mfaEnabled
        ? await mfaService.getRemainingBackupCodesCount(userId)
        : 0;

      res.json({
        mfaEnabled,
        backupCodesRemaining
      });
    } catch (error) {
      logger.error({ error }, 'MFA status error');
      res.status(500).json({ message: "Failed to get MFA status" });
    }
  });

  /**
   * POST /api/auth/mfa/disable
   * Disable MFA (requires password verification)
   */
  app.post('/api/auth/mfa/disable', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { password } = req.body;
      if (!password) return res.status(400).json({ message: "Password required to disable MFA" });

      const user = await userRepository.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Verify password
      if (user.authProvider === 'local') {
        const credentials = await userCredentialsRepository.findByUserId(userId);
        if (!credentials) {
          return res.status(400).json({ message: "No password set for this account" });
        }

        const isMatch = await authService.comparePassword(password, credentials.passwordHash);
        if (!isMatch) {
          return res.status(401).json({ message: "Invalid password" });
        }
      } else {
        return res.status(400).json({
          message: "Cannot disable MFA for OAuth accounts without password"
        });
      }

      // Disable MFA
      await mfaService.disableMfa(userId);

      logger.info({ userId }, 'MFA disabled by user');

      res.json({ message: "MFA disabled successfully" });
    } catch (error) {
      logger.error({ error }, 'MFA disable error');
      res.status(500).json({ message: "Failed to disable MFA" });
    }
  });

  /**
   * POST /api/auth/mfa/backup-codes/regenerate
   * Regenerate backup codes
   */
  app.post('/api/auth/mfa/backup-codes/regenerate', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const user = await userRepository.findById(userId);
      if (!user || !user.mfaEnabled) {
        return res.status(400).json({ message: "MFA is not enabled" });
      }

      const backupCodes = await mfaService.regenerateBackupCodes(userId);

      logger.info({ userId }, 'Backup codes regenerated');

      res.json({
        message: "New backup codes generated",
        backupCodes
      });
    } catch (error) {
      logger.error({ error }, 'Backup codes regeneration error');
      res.status(500).json({ message: "Failed to regenerate backup codes" });
    }
  });

  // =================================================================
  // SESSION MANAGEMENT
  // =================================================================

  /**
   * GET /api/auth/sessions
   * List all active sessions for current user
   */
  app.get('/api/auth/sessions', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      // Get current session token to identify which is current
      const cookies = parseCookies(req.headers.cookie || '');
      const currentRefreshToken = cookies['refresh_token'];

      const sessions = await db.query.refreshTokens.findMany({
        where: and(
          eq(refreshTokens.userId, userId),
          eq(refreshTokens.revoked, false),
          gt(refreshTokens.expiresAt, new Date())
        ),
        orderBy: [desc(refreshTokens.lastUsedAt), desc(refreshTokens.createdAt)]
      });

      const enrichedSessions = sessions.map((session) => ({
        id: session.id,
        deviceName: session.deviceName || parseDeviceName((session.metadata as any)?.userAgent),
        location: session.location || getLocationFromIP(session.ipAddress || (session.metadata as any)?.ip),
        ipAddress: session.ipAddress || (session.metadata as any)?.ip || 'Unknown',
        lastUsedAt: session.lastUsedAt || session.createdAt,
        createdAt: session.createdAt,
        current: currentRefreshToken ? session.token === currentRefreshToken : false
      }));

      logger.info({ userId, sessionCount: enrichedSessions.length }, 'Listed active sessions');

      res.json({ sessions: enrichedSessions });
    } catch (error) {
      logger.error({ error }, 'Error listing sessions');
      res.status(500).json({ message: "Failed to list sessions" });
    }
  });

  /**
   * DELETE /api/auth/sessions/:sessionId
   * Revoke a specific session
   */
  app.delete('/api/auth/sessions/:sessionId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { sessionId } = req.params;

      // Verify session belongs to user
      const session = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.id, sessionId)
      });

      if (!session || session.userId !== userId) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Get current session token
      const cookies = parseCookies(req.headers.cookie || '');
      const currentRefreshToken = cookies['refresh_token'];

      // Prevent revoking current session (use logout instead)
      if (currentRefreshToken && session.token === currentRefreshToken) {
        return res.status(400).json({ message: "Cannot revoke current session. Use logout instead." });
      }

      // Revoke the session
      await db.update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.id, sessionId));

      logger.info({ userId, sessionId }, 'Session revoked');

      res.json({ message: "Session revoked successfully" });
    } catch (error) {
      logger.error({ error }, 'Error revoking session');
      res.status(500).json({ message: "Failed to revoke session" });
    }
  });

  /**
   * DELETE /api/auth/sessions/all
   * Logout from all other devices
   */
  app.delete('/api/auth/sessions/all', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      // Get current session token
      const cookies = parseCookies(req.headers.cookie || '');
      const currentRefreshToken = cookies['refresh_token'];

      if (!currentRefreshToken) {
        return res.status(400).json({ message: "No active session found" });
      }

      // Revoke all except current
      await db.update(refreshTokens)
        .set({ revoked: true })
        .where(and(
          eq(refreshTokens.userId, userId),
          ne(refreshTokens.token, currentRefreshToken)
        ));

      // Also revoke all trusted devices
      await db.update(trustedDevices)
        .set({ revoked: true })
        .where(eq(trustedDevices.userId, userId));

      logger.info({ userId }, 'All other sessions revoked');

      res.json({ message: "Logged out from all other devices" });
    } catch (error) {
      logger.error({ error }, 'Error revoking all sessions');
      res.status(500).json({ message: "Failed to revoke sessions" });
    }
  });

  // =================================================================
  // TRUSTED DEVICES
  // =================================================================

  /**
   * POST /api/auth/trust-device
   * Mark current device as trusted (skip MFA for 30 days)
   */
  app.post('/api/auth/trust-device', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const deviceFingerprint = generateDeviceFingerprint(req);
      const deviceName = parseDeviceName(req.headers['user-agent']);
      const ipAddress = req.ip;
      const location = getLocationFromIP(ipAddress);
      const trustedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // Check if already trusted
      const existing = await db.query.trustedDevices.findFirst({
        where: and(
          eq(trustedDevices.userId, userId),
          eq(trustedDevices.deviceFingerprint, deviceFingerprint),
          eq(trustedDevices.revoked, false)
        )
      });

      if (existing) {
        // Update expiry
        await db.update(trustedDevices)
          .set({ trustedUntil, lastUsedAt: new Date() })
          .where(eq(trustedDevices.id, existing.id));

        logger.info({ userId, deviceFingerprint }, 'Trusted device expiry updated');
      } else {
        // Create new trusted device
        await db.insert(trustedDevices).values({
          userId,
          deviceFingerprint,
          deviceName,
          trustedUntil,
          ipAddress,
          location,
          userAgent: req.headers['user-agent'] || null,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          revoked: false
        });

        logger.info({ userId, deviceFingerprint }, 'Device marked as trusted');
      }

      res.json({
        message: "Device trusted successfully",
        trustedUntil
      });
    } catch (error) {
      logger.error({ error }, 'Error trusting device');
      res.status(500).json({ message: "Failed to trust device" });
    }
  });

  /**
   * GET /api/auth/trusted-devices
   * List all trusted devices for current user
   */
  app.get('/api/auth/trusted-devices', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const devices = await db.query.trustedDevices.findMany({
        where: and(
          eq(trustedDevices.userId, userId),
          eq(trustedDevices.revoked, false),
          gt(trustedDevices.trustedUntil, new Date())
        ),
        orderBy: [desc(trustedDevices.lastUsedAt), desc(trustedDevices.createdAt)]
      });

      const currentFingerprint = generateDeviceFingerprint(req);

      const enrichedDevices = devices.map((device) => ({
        id: device.id,
        deviceName: device.deviceName || 'Unknown Device',
        location: device.location || 'Unknown Location',
        ipAddress: device.ipAddress || 'Unknown',
        trustedUntil: device.trustedUntil,
        lastUsedAt: device.lastUsedAt || device.createdAt,
        createdAt: device.createdAt,
        current: device.deviceFingerprint === currentFingerprint
      }));

      logger.info({ userId, deviceCount: enrichedDevices.length }, 'Listed trusted devices');

      res.json({ devices: enrichedDevices });
    } catch (error) {
      logger.error({ error }, 'Error listing trusted devices');
      res.status(500).json({ message: "Failed to list trusted devices" });
    }
  });

  /**
   * DELETE /api/auth/trusted-devices/:deviceId
   * Revoke a trusted device
   */
  app.delete('/api/auth/trusted-devices/:deviceId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { deviceId } = req.params;

      // Verify device belongs to user
      const device = await db.query.trustedDevices.findFirst({
        where: eq(trustedDevices.id, deviceId)
      });

      if (!device || device.userId !== userId) {
        return res.status(404).json({ message: "Device not found" });
      }

      // Revoke the device
      await db.update(trustedDevices)
        .set({ revoked: true })
        .where(eq(trustedDevices.id, deviceId));

      logger.info({ userId, deviceId }, 'Trusted device revoked');

      res.json({ message: "Device revoked successfully" });
    } catch (error) {
      logger.error({ error }, 'Error revoking trusted device');
      res.status(500).json({ message: "Failed to revoke device" });
    }
  });

  // Dev Login Stub (if needed) - kept minimal
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    app.all('/api/auth/dev-login', async (req, res) => {
      const user = {
        id: 'dev-user',
        email: 'dev@example.com',
        tenantId: 'default',
        firstName: 'Dev',
        lastName: 'User',
        fullName: 'Dev User',
        role: 'owner',
        tenantRole: 'owner',
        authProvider: 'local'
      } as unknown as User;
      const token = authService.createToken(user);
      const refresh = await authService.createRefreshToken(user.id);
      res.setHeader('Set-Cookie', serialize('refresh_token', refresh, { path: '/', httpOnly: true }));
      if (req.method === 'GET') res.redirect('/dashboard');
      else res.json({ user, token });
    });
  }
}
