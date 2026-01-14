import crypto from "crypto";

import bcrypt from "bcrypt";
import { eq, and } from "drizzle-orm";
import QRCode from "qrcode";
import speakeasy from "speakeasy";

import { mfaSecrets, mfaBackupCodes, users } from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";



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
            name: `VaultLogic (${userEmail})`,
            issuer: 'VaultLogic',
            length: 32
        });

        if (!secret.base32) {
            throw new Error('Failed to generate TOTP secret');
        }

        // Generate QR code
        const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url || '');

        // Generate backup codes
        const backupCodes = this.generateBackupCodes();

        // Store secret in database (disabled by default until verified)
        await db.insert(mfaSecrets)
            .values({
                userId,
                secret: secret.base32,
                enabled: false,
                createdAt: new Date()
            })
            .onConflictDoUpdate({
                target: mfaSecrets.userId,
                set: {
                    secret: secret.base32,
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

        // Verify the TOTP token
        const isValid = speakeasy.totp.verify({
            secret: mfaSecret.secret,
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
        await db.update(users)
            .set({ mfaEnabled: true })
            .where(eq(users.id, userId));

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

        // Verify the TOTP token
        const isValid = speakeasy.totp.verify({
            secret: mfaSecret.secret,
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

        return user?.mfaEnabled || false;
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
                codeHash: await bcrypt.hash(code, BCRYPT_ROUNDS),
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
            const isMatch = await bcrypt.compare(code, storedCode.codeHash);

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
        await db.update(users)
            .set({ mfaEnabled: false })
            .where(eq(users.id, userId));

        // Delete backup codes
        await db.delete(mfaBackupCodes)
            .where(eq(mfaBackupCodes.userId, userId));

        log.info({ userId }, 'MFA disabled');
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
