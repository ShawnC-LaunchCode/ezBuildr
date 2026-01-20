import crypto from 'crypto';

import bcrypt from 'bcrypt';
import { eq, and, gt, lt } from "drizzle-orm";
import jwt, { type SignOptions } from 'jsonwebtoken';
import zxcvbn from 'zxcvbn';

import {
    refreshTokens,
    passwordResetTokens,
    emailVerificationTokens,
    users,
    type User
} from "@shared/schema";


import {
    PASSWORD_CONFIG,
    JWT_CONFIG,
    REFRESH_TOKEN_CONFIG,
    PASSWORD_RESET_CONFIG,
    EMAIL_VERIFICATION_CONFIG,
    PASSWORD_POLICY
} from "../config/auth";
import { env } from "../config/env";
import { db } from "../db";
import {
    InvalidTokenError,
    TokenExpiredError,
    InvalidCredentialsError
} from "../errors/AuthErrors";
import { createLogger } from "../logger";
import { hashToken } from "../utils/encryption";

import { accountLockoutService } from "./AccountLockoutService";
import { sendPasswordResetEmail, sendVerificationEmail } from "./emailService";

const log = createLogger({ module: 'auth-service' });

const SALT_ROUNDS = PASSWORD_CONFIG.SALT_ROUNDS;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const JWT_SECRET = env.JWT_SECRET;

export interface PortalTokenPayload {
    email: string;
    portal: true;
    iat?: number;
    exp?: number;
}

export interface JWTPayload {
    userId: string;
    email: string;
    tenantId: string | null;
    role: 'admin' | 'creator' | 'owner' | 'builder' | 'runner' | 'viewer' | null;
    tenantRole?: 'owner' | 'builder' | 'runner' | 'viewer' | null;
    iat?: number;
    exp?: number;
}

export interface RefreshTokenMetadata {
    userAgent?: string;
    ip?: string;
    [key: string]: any;
}

export class AuthService {
    private db: typeof db;

    constructor(database = db) {
        this.db = database;
    }

    // =================================================================
    // JWT & CRYPTO CORE
    // =================================================================

    /**
     * Create a JWT token for a user
     */
    createToken(user: User): string {
        if (!JWT_SECRET) {
            throw new Error('JWT_SECRET not configured');
        }

        try {
            const payload: JWTPayload = {
                userId: user.id,
                email: user.email,
                tenantId: user.tenantId || null,
                role: user.role as any, // System role (admin/creator)
                tenantRole: user.tenantRole as any, // Tenant role (owner/builder/etc)
            };

            const options: SignOptions = {
                expiresIn: JWT_EXPIRY as any,
                algorithm: 'HS256',
            };

            return jwt.sign(payload, JWT_SECRET, options);
        } catch (error) {
            log.error({ error, userId: user.id }, 'Failed to create JWT token');
            throw new Error('Token creation failed', { cause: error });
        }
    }

    /**
     * Verify and decode a JWT access token
     *
     * Validates the JWT signature using HS256 algorithm and returns the decoded payload.
     * Automatically checks token expiration and throws descriptive errors.
     *
     * @param token - The JWT token to verify (without "Bearer " prefix)
     * @returns {JWTPayload} The decoded token payload containing userId, email, tenantId, and role
     *
     * @throws {Error} 'JWT not configured' if JWT_SECRET is not set
     * @throws {Error} 'Token expired' if the token has passed its expiration time
     * @throws {Error} 'Invalid token' for signature mismatch or malformed tokens
     *
     * @security
     * - Uses HS256 (HMAC-SHA256) for signature verification
     * - Enforces algorithm whitelist (only HS256 accepted)
     * - Automatic expiration validation via jwt library
     *
     * @example
     * ```typescript
     * try {
     *   const payload = authService.verifyToken(token);
     *   console.log('User ID:', payload.userId);
     *   console.log('Email:', payload.email);
     * } catch (error) {
     *   if (error.message === 'Token expired') {
     *     // Refresh token flow
     *   } else {
     *     // Invalid token - force re-authentication
     *   }
     * }
     * ```
     */
    verifyToken(token: string): JWTPayload {
        if (!JWT_SECRET) { throw new Error('JWT not configured'); }

        try {
            return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new TokenExpiredError('Token has expired');
            }
            throw new InvalidTokenError('Invalid or malformed token');
        }
    }

    /**
     * Create a special JWT token for Portal users (email-only)
     */
    createPortalToken(email: string): string {
        if (!JWT_SECRET) { throw new Error('JWT_SECRET not configured'); }
        const payload = { email, portal: true };
        return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h', algorithm: 'HS256' });
    }

    /**
     * Verify a Portal JWT token
     */
    verifyPortalToken(token: string): { email: string } {
        if (!JWT_SECRET) { throw new Error('JWT not configured'); }
        try {
            const payload = jwt.verify(token, JWT_SECRET) as PortalTokenPayload;
            if (!payload.portal || !payload.email) { throw new Error('Invalid portal token'); }
            return { email: payload.email };
        } catch (error) {
            throw new Error('Invalid portal token');
        }
    }

    /**
     * Hash a password using bcrypt
     */
    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, SALT_ROUNDS);
    }

    /**
     * Compare a password with its hash
     */
    async comparePassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    /**
     * Extract token from Authorization header
     */
    extractTokenFromHeader(authHeader: string | undefined): string | null {
        if (!authHeader) { return null; }
        if (authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        return authHeader;
    }

    /**
     * Check if a token looks like a JWT
     */
    looksLikeJwt(token: string): boolean {
        if (!token) { return false; }
        const parts = token.split('.');
        return parts.length === 3 && parts.every(part => part.length > 0);
    }

    // =================================================================
    // VALIDATION HELPER
    // =================================================================

    /**
     * Validate password strength using zxcvbn
     *
     * @param password - The password to validate
     * @param userInputs - Optional user information (email, firstName, lastName) to prevent personal info in password
     * @returns {valid: boolean, message?: string, score?: number, feedback?: object}
     */
    validatePasswordStrength(password: string, userInputs?: string[]): { valid: boolean; message?: string; score?: number; feedback?: any } {
        // Check length first (before expensive zxcvbn check)
        if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
            return { valid: false, message: `Password must be at least ${PASSWORD_POLICY.MIN_LENGTH} characters long` };
        }
        if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
            return { valid: false, message: `Password must be at most ${PASSWORD_POLICY.MAX_LENGTH} characters long` };
        }

        // Use zxcvbn for strength scoring (0-4 scale)
        const result = zxcvbn(password, userInputs || []);

        // Require score of 3 or higher (strong password)
        // 0: too guessable (risky password)
        // 1: very guessable (protection from throttled online attacks)
        // 2: somewhat guessable (protection from unthrottled online attacks)
        // 3: safely unguessable (moderate protection from offline slow-hash scenario)
        // 4: very unguessable (strong protection from offline slow-hash scenario)
        const minScore = PASSWORD_POLICY.MIN_STRENGTH_SCORE || 3;

        if (result.score < minScore) {
            // Provide helpful feedback from zxcvbn
            const suggestions = result.feedback.suggestions.join(' ') || 'Try a stronger password.';
            const warning = result.feedback.warning ? `${result.feedback.warning}. ` : '';
            return {
                valid: false,
                message: `${warning}${suggestions}`,
                score: result.score,
                feedback: result.feedback
            };
        }

        return { valid: true, score: result.score };
    }

    validateEmail(email: string): boolean {
        // RFC 5321: Maximum email length is 254 characters
        if (!email || email.length > 254 || email.length < 3) {
            return false;
        }

        // Stricter regex: local-part@domain.tld
        // - Local part: 1-64 chars, no spaces, cannot start or end with dot
        // - Domain: 1-255 chars, no spaces, ASCII only (no unicode)
        // - TLD: at least 2 chars
        const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

        if (!emailRegex.test(email)) {
            return false;
        }

        // Split for additional validation
        const [localPart, domain] = email.split('@');

        // SECURITY FIX: Reject emails starting or ending with dot in local part
        if (localPart.startsWith('.') || localPart.endsWith('.')) {
            return false;
        }

        // No consecutive dots
        if (email.includes('..')) {
            return false;
        }

        // Domain must have at least one dot
        if (!domain?.includes('.')) {
            return false;
        }

        // SECURITY FIX: Reject unicode domains (or convert to punycode)
        // This prevents homograph attacks and ensures ASCII-only domains
        // eslint-disable-next-line no-control-regex
        if (/[^\x00-\x7F]/.test(domain)) {
            return false; // Reject non-ASCII characters in domain
        }

        return true;
    }

    // =================================================================
    // REFRESH TOKENS
    // =================================================================

    /**
     * Create a new refresh token for a user
     *
     * Generates a cryptographically secure random refresh token (80 hex characters),
     * hashes it with SHA-256, and stores it in the database with a 30-day expiration.
     * The plain token is returned to the client for use in HTTP-only cookies.
     *
     * @param userId - The user ID to associate the token with
     * @param metadata - Optional metadata including IP address and user agent for device tracking
     * @returns {Promise<string>} The plain (unhashed) refresh token to be sent to the client
     *
     * @throws {Error} If database insertion fails
     *
     * @security
     * - Token is 40 bytes (80 hex chars) providing 160 bits of entropy
     * - SHA-256 hash stored in database (prevents token theft via database breach)
     * - Tokens expire after 30 days
     * - Device fingerprinting via IP/User-Agent for suspicious activity detection
     *
     * @example
     * ```typescript
     * const refreshToken = await authService.createRefreshToken('user-123', {
     *   ip: '192.168.1.1',
     *   userAgent: 'Mozilla/5.0...'
     * });
     * // Set in HTTP-only cookie
     * res.setHeader('Set-Cookie', serialize('refresh_token', refreshToken, {
     *   httpOnly: true,
     *   secure: true,
     *   sameSite: 'strict'
     * }));
     * ```
     */
    async createRefreshToken(userId: string, metadata: RefreshTokenMetadata = {}): Promise<string> {
        const plainToken = crypto.randomBytes(40).toString('hex');
        const tokenHash = hashToken(plainToken);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

        // Import device utilities (dynamic import to avoid circular dependencies)
        const { parseDeviceName, getLocationFromIP } = await import('../utils/deviceFingerprint');

        const deviceName = metadata.userAgent ? parseDeviceName(metadata.userAgent) : null;
        const ipAddress = metadata.ip || null;
        const location = ipAddress ? getLocationFromIP(ipAddress) : null;

        await this.db.insert(refreshTokens).values({
            userId,
            token: tokenHash,
            expiresAt,
            metadata,
            deviceName,
            ipAddress,
            location,
            lastUsedAt: new Date(),
            revoked: false
        });

        return plainToken;
    }

    /**
     * Verify and rotate a refresh token (automatic token rotation)
     *
     * Implements automatic refresh token rotation as recommended by OAuth 2.0 Security Best Practices (RFC 8252).
     * When a refresh token is used, it is immediately revoked and a new one is issued. This limits the
     * window of opportunity for token theft and enables detection of token reuse attacks.
     *
     * @param plainToken - The plain (unhashed) refresh token from the client
     * @returns {Promise<object|null>} Object containing userId and newRefreshToken if valid, null if invalid/expired
     *
     * @throws {Error} If database operations fail
     *
     * @security
     * - **Reuse Detection**: If a revoked token is used, ALL user sessions are revoked (indicates token theft)
     * - **Single Use**: Each refresh token can only be used once (automatic rotation)
     * - **Expiration Check**: Tokens are validated against expiration timestamp
     * - **Hash Comparison**: Only hashed tokens are stored/compared (prevents database breach impact)
     *
     * @example
     * ```typescript
     * const result = await authService.rotateRefreshToken(oldToken);
     * if (result) {
     *   // Generate new access token
     *   const accessToken = authService.createToken(user);
     *   // Set new refresh token in cookie
     *   res.setHeader('Set-Cookie', serialize('refresh_token', result.newRefreshToken, { ... }));
     *   res.json({ token: accessToken });
     * } else {
     *   // Invalid/expired/reused token - force login
     *   res.status(401).json({ message: 'Invalid refresh token' });
     * }
     * ```
     */
    async rotateRefreshToken(plainToken: string): Promise<{ userId: string, newRefreshToken: string } | null> {
        const tokenHash = hashToken(plainToken);

        // DEBUG LOG
        // logger is available as 'log' from imports
        log.info({ tokenHash, plainTokenLen: plainToken.length }, 'DEBUG: rotateRefreshToken called');

        // Find token purely by hash to detect state
        const storedToken = await this.db.query.refreshTokens.findFirst({
            where: eq(refreshTokens.token, tokenHash)
        });

        if (!storedToken) {
            log.warn({ tokenHash }, 'Security: Unknown refresh token used (Not Found in DB)');

            // DEBUG: List all tokens for debugging (careful in prod, safe in test)
            if (process.env.NODE_ENV === 'test') {
                const allTokens = await this.db.select().from(refreshTokens);
                log.info({ allTokensCount: allTokens.length, sampleToken: allTokens[0]?.token }, 'DEBUG: Tokens in DB');
            }
            return null;
        }

        // Reuse Detection: If token is already revoked, this is a theft attempt
        if (storedToken.revoked) {
            log.warn({ userId: storedToken.userId, tokenHash }, 'Security: REUSED REFRESH TOKEN DETECTED. Revoking all sessions.');
            await this.revokeAllUserTokens(storedToken.userId);
            return null;
        }

        // Expiry check
        if (storedToken.expiresAt < new Date()) {
            log.warn({ userId: storedToken.userId }, 'Security: Expired refresh token used');
            return null;
        }

        // Valid token -> Rotate it
        // Valid token -> Rotate it (Atomic Check-and-Set)
        // Ensure we only update if it's still not revoked.
        const [revokedToken] = await this.db.update(refreshTokens)
            .set({ revoked: true })
            .where(and(
                eq(refreshTokens.id, storedToken.id),
                eq(refreshTokens.revoked, false)
            ))
            .returning();

        if (!revokedToken) {
            // Race condition: Token was revoked between read and write
            log.warn({ userId: storedToken.userId, tokenHash }, 'Security: REUSED REFRESH TOKEN DETECTED (Concurrent). Revoking all sessions.');
            await this.revokeAllUserTokens(storedToken.userId);
            return null;
        }

        // Issue a new refresh token
        const newRefreshToken = await this.createRefreshToken(storedToken.userId, storedToken.metadata as any);

        return {
            userId: storedToken.userId,
            newRefreshToken
        };
    }

    async revokeRefreshToken(plainToken: string): Promise<void> {
        const tokenHash = hashToken(plainToken);
        await this.db.update(refreshTokens)
            .set({ revoked: true })
            .where(eq(refreshTokens.token, tokenHash));
    }

    async revokeAllUserTokens(userId: string): Promise<void> {
        await this.db.update(refreshTokens)
            .set({ revoked: true })
            .where(eq(refreshTokens.userId, userId));
    }

    async validateRefreshToken(plainToken: string): Promise<string | null> {
        const tokenHash = hashToken(plainToken);

        const storedToken = await this.db.query.refreshTokens.findFirst({
            where: and(
                eq(refreshTokens.token, tokenHash),
                eq(refreshTokens.revoked, false),
                gt(refreshTokens.expiresAt, new Date())
            )
        });

        return storedToken ? storedToken.userId : null;
    }

    // =================================================================
    // PASSWORD RESET
    // =================================================================

    async generatePasswordResetToken(email: string): Promise<string | null> {
        const user = await this.db.query.users.findFirst({
            where: eq(users.email, email)
        });

        if (!user) { return null; }

        const plainToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(plainToken);
        const expiresAt = new Date(Date.now() + PASSWORD_RESET_CONFIG.TOKEN_EXPIRY_MS);

        await this.db.update(passwordResetTokens)
            .set({ used: true })
            .where(eq(passwordResetTokens.userId, user.id));

        await this.db.insert(passwordResetTokens).values({
            userId: user.id,
            token: tokenHash,
            expiresAt,
            used: false
        });

        await sendPasswordResetEmail(email, plainToken);
        log.info({ email }, 'Password reset email sent');

        return plainToken;
    }

    async verifyPasswordResetToken(plainToken: string): Promise<string | null> {
        const tokenHash = hashToken(plainToken);

        const storedToken = await this.db.query.passwordResetTokens.findFirst({
            where: and(
                eq(passwordResetTokens.token, tokenHash),
                eq(passwordResetTokens.used, false),
                gt(passwordResetTokens.expiresAt, new Date())
            )
        });

        if (!storedToken) { return null; }
        return storedToken.userId;
    }

    async consumePasswordResetToken(plainToken: string): Promise<void> {
        const tokenHash = hashToken(plainToken);
        await this.db.update(passwordResetTokens)
            .set({ used: true })
            .where(eq(passwordResetTokens.token, tokenHash));
    }

    // =================================================================
    // EMAIL VERIFICATION
    // =================================================================

    async generateEmailVerificationToken(userId: string, email: string): Promise<string> {
        const plainToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(plainToken);
        const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_CONFIG.TOKEN_EXPIRY_MS);

        await this.db.insert(emailVerificationTokens).values({
            userId,
            token: tokenHash,
            expiresAt
        });

        await sendVerificationEmail(email, plainToken);

        return plainToken;
    }

    async verifyEmail(plainToken: string): Promise<boolean> {
        const tokenHash = hashToken(plainToken);

        const storedToken = await this.db.query.emailVerificationTokens.findFirst({
            where: and(
                eq(emailVerificationTokens.token, tokenHash),
                gt(emailVerificationTokens.expiresAt, new Date())
            )
        });

        if (!storedToken) { return false; }

        await this.db.update(users)
            .set({ emailVerified: true })
            .where(eq(users.id, storedToken.userId));

        await this.db.delete(emailVerificationTokens)
            .where(eq(emailVerificationTokens.id, storedToken.id));

        return true;
    }
    async cleanupExpiredTokens(): Promise<void> {
        const now = new Date();

        // SECURITY FIX: Delete tokens that are (revoked AND expired) OR just expired
        // Using OR logic to consolidate cleanup in one query
        await this.db.delete(refreshTokens)
            .where(lt(refreshTokens.expiresAt, now));

        await this.db.delete(passwordResetTokens)
            .where(lt(passwordResetTokens.expiresAt, now));

        await this.db.delete(emailVerificationTokens)
            .where(lt(emailVerificationTokens.expiresAt, now));

        // Cleanup old login attempts (30 days retention)
        await accountLockoutService.cleanupOldAttempts();

        log.info('Cleaned up expired tokens and old login attempts');
    }
}

export const authService = new AuthService();
