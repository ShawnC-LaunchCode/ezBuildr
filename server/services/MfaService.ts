import crypto from "crypto";

import { hash as bcryptHash, compare as bcryptCompare } from "bcrypt";
import { eq, and } from "drizzle-orm";
import { toDataURL as qrToDataURL } from "qrcode";

import * as speakeasy from "speakeasy";

import { mfaSecrets, mfaBackupCodes, users } from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";
import { encrypt, decrypt } from "../utils/encryption";
import { findSelfUser, updateSelfUser } from "../utils/selfUser";



const log = createLogger({ module: 'mfa-service' });

const BACKUP_CODES_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;
const BCRYPT_ROUNDS = 10; // Backup codes are one-time use, lower rounds acceptable

export class MfaService {
    // =================================================================
    // TOTP SETUP
    // =================================================================

    /**
     * Generate a new TOTP secret for a user
     * Returns the secret and a QR code data URL
     */
    async generateTotpSecret(userId: string, userEmail: string): Promise<{
        secret: string;
        qrCodeDataUrl: string;
        backupCodes: string[];
    }> {
        // Generate TOTP secret
        const secret = speakeasy.generateSecret({
            name: `ezBuildr (${userEmail})`,
            issuer: 'ezBuildr',
            length: 32
        });

        if (!secret.base32) {
            throw new Error('Failed to generate TOTP secret');
        }

        // Generate QR code
        const qrCodeDataUrl = await qrToDataURL(secret.otpauth_url ?? '');

        // Generate backup codes
        const backupCodes = this.generateBackupCodes();

        // Store secret in database (disabled by default until verified)
        const encryptedSecret = encrypt(secret.base32);
        
        await db.insert(mfaSecrets)
            .values({
                userId,
                secret: encryptedSecret,
                enabled: false,
                createdAt: new Date()
            })
            .onConflictDoUpdate({
                target: mfaSecrets.userId,
                set: {
                    secret: encryptedSecret,
                    enabled: false, // Reset to disabled when regenerating
                    createdAt: new Date()
                }
            });

        // Store hashed backup codes
        await this.storeBackupCodes(userId, backupCodes);

        log.info({ userId }, 'Generated TOTP secret');

        return {
            secret: secret.base32,
            qrCodeDataUrl,
            backupCodes
        };
    }

    /**
     * Verify a TOTP code and enable MFA
     */
    async verifyAndEnableMfa(userId: string, token: string): Promise<boolean> {
        // Get user's secret
        const mfaSecret = await db.query.mfaSecrets.findFirst({
            where: eq(mfaSecrets.userId, userId)
        });

        if (!mfaSecret) {
            log.warn({ userId }, 'No MFA secret found for user');
            return false;
        }

        let plainSecret = mfaSecret.secret;
        try {
            plainSecret = decrypt(mfaSecret.secret);
        } catch (error) {
            // Fallback for pre-encryption secrets (before backfill runs)
        }

        // Verify the TOTP token
        const isValid = speakeasy.totp.verify({
            secret: plainSecret,
            encoding: 'base32',
            token,
            window: 2 // Allow 2 time steps before/after (60 seconds total window)
        });

        if (!isValid) {
            log.warn({ userId }, 'Invalid TOTP token provided');
            return false;
        }

        // Enable MFA
        await db.update(mfaSecrets)
            .set({
                enabled: true,
                enabledAt: new Date()
            })
            .where(eq(mfaSecrets.userId, userId));

        // Update user record
        await this.setUserMfaFlag(userId, true);

        log.info({ userId }, 'MFA enabled successfully');

        return true;
    }

    // =================================================================
    // TOTP VERIFICATION
    // =================================================================

    /**
     * Verify a TOTP code for login
     */
    async verifyTotp(userId: string, token: string): Promise<boolean> {
        // Get user's secret
        const mfaSecret = await db.query.mfaSecrets.findFirst({
            where: and(
                eq(mfaSecrets.userId, userId),
                eq(mfaSecrets.enabled, true)
            )
        });

        if (!mfaSecret) {
            log.warn({ userId }, 'No enabled MFA secret found for user');
            return false;
        }

        let plainSecret = mfaSecret.secret;
        try {
            plainSecret = decrypt(mfaSecret.secret);
        } catch (error) {
            // Fallback for pre-encryption secrets
        }

        // Verify the TOTP token
        const isValid = speakeasy.totp.verify({
            secret: plainSecret,
            encoding: 'base32',
            token,
            window: 2 // Allow 2 time steps before/after
        });

        if (isValid) {
            log.info({ userId }, 'TOTP verification successful');
        } else {
            log.warn({ userId }, 'TOTP verification failed');
        }

        return isValid;
    }

    /**
     * Check if user has MFA enabled
     */
    async isMfaEnabled(userId: string): Promise<boolean> {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId)
        });

        return user?.mfaEnabled ?? false;
    }

    // =================================================================
    // BACKUP CODES
    // =================================================================

    /**
     * Generate backup codes (plain text)
     */
    private generateBackupCodes(): string[] {
        const codes: string[] = [];

        for (let i = 0; i < BACKUP_CODES_COUNT; i++) {
            // Generate random alphanumeric code
            const code = crypto.randomBytes(BACKUP_CODE_LENGTH)
                .toString('hex')
                .slice(0, BACKUP_CODE_LENGTH)
                .toUpperCase();

            // Format as XXXX-XXXX for readability
            const formattedCode = `${code.slice(0, 4)}-${code.slice(4)}`;
            codes.push(formattedCode);
        }

        return codes;
    }

    /**
     * Store hashed backup codes in database
     */
    private async storeBackupCodes(userId: string, codes: string[]): Promise<void> {
        // Delete existing backup codes
        await db.delete(mfaBackupCodes)
            .where(eq(mfaBackupCodes.userId, userId));

        // Hash and store new codes
        const hashedCodes = await Promise.all(
            codes.map(async (code) => ({
                userId,
                codeHash: await bcryptHash(code, BCRYPT_ROUNDS),
                used: false,
                createdAt: new Date()
            }))
        );

        await db.insert(mfaBackupCodes).values(hashedCodes);

        log.info({ userId, count: codes.length }, 'Stored backup codes');
    }

    /**
     * Verify and consume a backup code
     */
    async verifyBackupCode(userId: string, code: string): Promise<boolean> {
        // Get all unused backup codes for user
        const codes = await db.query.mfaBackupCodes.findMany({
            where: and(
                eq(mfaBackupCodes.userId, userId),
                eq(mfaBackupCodes.used, false)
            )
        });

        if (codes.length === 0) {
            log.warn({ userId }, 'No unused backup codes available');
            return false;
        }

        // Try to match the code
        for (const storedCode of codes) {
            const isMatch = await bcryptCompare(code, storedCode.codeHash);

            if (isMatch) {
                // Mark code as used
                await db.update(mfaBackupCodes)
                    .set({
                        used: true,
                        usedAt: new Date()
                    })
                    .where(eq(mfaBackupCodes.id, storedCode.id));

                log.info({ userId }, 'Backup code verified and consumed');

                // Warn if this was the last code
                if (codes.length === 1) {
                    log.warn({ userId }, 'Last backup code used - user should regenerate');
                }

                return true;
            }
        }

        log.warn({ userId }, 'Invalid backup code provided');
        return false;
    }

    /**
     * Regenerate backup codes
     */
    async regenerateBackupCodes(userId: string): Promise<string[]> {
        const backupCodes = this.generateBackupCodes();
        await this.storeBackupCodes(userId, backupCodes);

        log.info({ userId }, 'Regenerated backup codes');

        return backupCodes;
    }

    /**
     * Get remaining backup codes count
     */
    async getRemainingBackupCodesCount(userId: string): Promise<number> {
        const codes = await db.query.mfaBackupCodes.findMany({
            where: and(
                eq(mfaBackupCodes.userId, userId),
                eq(mfaBackupCodes.used, false)
            )
        });

        return codes.length;
    }

    // =================================================================
    // DISABLE MFA
    // =================================================================

    /**
     * Disable MFA for a user (requires password verification)
     */
    async disableMfa(userId: string): Promise<void> {
        // Disable MFA secret
        await db.update(mfaSecrets)
            .set({ enabled: false })
            .where(eq(mfaSecrets.userId, userId));

        // Update user record
        await this.setUserMfaFlag(userId, false);

        // Delete backup codes
        await db.delete(mfaBackupCodes)
            .where(eq(mfaBackupCodes.userId, userId));

        log.info({ userId }, 'MFA disabled');
    }

    /**
     * Flip `users.mfaEnabled` for the user this operation is about.
     *
     * RLS-5: `users` is covered, and this write is reached before any tenant is
     * pinned (MFA setup/verify run on the auth routes, where establishing the
     * caller is still in progress). Written from the pool it fails WITH CHECK
     * for any user who has a tenant, leaving `mfa_secrets.enabled = true` while
     * the user row still says MFA is off — a split state, not a clean failure.
     * `updateSelfUser` pins the self-id GUC so the row is visible and the row's
     * own tenant so the write is permitted.
     *
     * ⚠️ `adminResetMfa` reaches `disableMfa` for ANOTHER user, which is a
     * cross-tenant admin write and does not belong on this path — it is part of
     * the admin.routes/adminDb cluster still outstanding in
     * tickets/RLS_HANDOFF.md, and is the reason this reads the row rather than
     * assuming the caller's own tenant.
     */
    private async setUserMfaFlag(userId: string, enabled: boolean): Promise<void> {
        const user = await findSelfUser(userId);
        if (!user) {
            throw new Error('User not found');
        }
        await updateSelfUser(userId, user.tenantId, { mfaEnabled: enabled });
    }

    /**
     * Admin reset MFA (for locked out users)
     */
    async adminResetMfa(userId: string): Promise<void> {
        await this.disableMfa(userId);

        // Also delete the secret
        await db.delete(mfaSecrets)
            .where(eq(mfaSecrets.userId, userId));

        log.warn({ userId }, 'Admin reset MFA');
    }
}

export const mfaService = new MfaService();
