import { db } from "../../server/db";
import { users, userCredentials, refreshTokens, emailVerificationTokens, mfaSecrets, mfaBackupCodes, trustedDevices, accountLocks, loginAttempts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { authService } from "../../server/services/AuthService";
import speakeasy from "speakeasy";
import crypto from "crypto";
import bcrypt from "bcrypt";

/**
 * Test Helper Utilities
 * Provides common functions for test setup, teardown, and data creation
 */

// ============================================================
// DATABASE CLEANUP
// ============================================================

/**
 * Clean all auth-related tables
 */
export async function cleanAuthTables() {
  try {
    await db.delete(loginAttempts);
    await db.delete(accountLocks);
    await db.delete(trustedDevices);
    await db.delete(mfaBackupCodes);
    await db.delete(mfaSecrets);
    await db.delete(refreshTokens);
    await db.delete(emailVerificationTokens);
    await db.delete(userCredentials);
  } catch (error) {
    console.warn("Error cleaning auth tables:", error);
  }
}

/**
 * Clean specific test user and all related data
 */
export async function cleanTestUser(email: string) {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (user) {
      await db.delete(loginAttempts).where(eq(loginAttempts.email, email));
      await db.delete(accountLocks).where(eq(accountLocks.userId, user.id));
      await db.delete(trustedDevices).where(eq(trustedDevices.userId, user.id));
      await db.delete(mfaBackupCodes).where(eq(mfaBackupCodes.userId, user.id));
      await db.delete(mfaSecrets).where(eq(mfaSecrets.userId, user.id));
      await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
      await db.delete(userCredentials).where(eq(userCredentials.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  } catch (error) {
    console.warn("Error cleaning test user:", error);
  }
}

export function randomEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

export function randomPassword(): string {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*()_+";

  const password = [
    uppercase[Math.floor(Math.random() * uppercase.length)],
    lowercase[Math.floor(Math.random() * lowercase.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    special[Math.floor(Math.random() * special.length)],
    ...Array(10).fill(null).map(() => {
      const all = uppercase + lowercase + numbers + special;
      return all[Math.floor(Math.random() * all.length)];
    }),
  ];

  return password.sort(() => Math.random() - 0.5).join("");
}

// ============================================================
// USER CREATION HELPERS
// ============================================================

/**
 * Create a test user with credentials
 */
export async function createTestUser(options: {
  email?: string;
  password?: string;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
} = {}) {
  const email = options.email || randomEmail();
  const password = options.password || randomPassword();
  const passwordHash = await authService.hashPassword(password);

  const userId = crypto.randomBytes(16).toString('hex');

  // Create user
  await db.insert(users).values({
    id: userId,
    email,
    emailVerified: options.emailVerified ?? false,
    mfaEnabled: options.mfaEnabled ?? false,
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
    authProvider: 'local',
    role: 'creator',
    defaultMode: 'easy',
    createdAt: new Date(),
  });

  // Create credentials
  await db.insert(userCredentials).values({
    userId,
    passwordHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  return {
    user: user!,
    password,
    passwordHash,
    email,
    userId,
  };
}

/**
 * Create a verified test user
 */
export async function createVerifiedUser(options: {
  email?: string;
  password?: string;
} = {}) {
  return createTestUser({
    ...options,
    emailVerified: true,
  });
}

/**
 * Create a user with MFA enabled
 */
export async function createUserWithMfa(options: {
  email?: string;
  password?: string;
} = {}) {
  const userData = await createVerifiedUser(options);

  // Generate TOTP secret
  const secret = speakeasy.generateSecret({
    name: `VaultLogic (${userData.email})`,
    issuer: 'VaultLogic',
    length: 32,
  });

  // Store MFA secret
  await db.insert(mfaSecrets).values({
    userId: userData.userId,
    secret: secret.base32!,
    enabled: true,
    enabledAt: new Date(),
    createdAt: new Date(),
  });

  // Update user record
  await db.update(users)
    .set({ mfaEnabled: true })
    .where(eq(users.id, userData.userId));

  // Generate and store backup codes (10 codes, matching MfaService behavior)
  const backupCodes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(8)
      .toString('hex')
      .slice(0, 8)
      .toUpperCase();
    const formattedCode = `${code.slice(0, 4)}-${code.slice(4)}`;
    backupCodes.push(formattedCode);
  }

  // Hash and store backup codes
  const hashedCodes = await Promise.all(
    backupCodes.map(async (code) => ({
      userId: userData.userId,
      codeHash: await bcrypt.hash(code, 10),
      used: false,
      createdAt: new Date()
    }))
  );

  await db.insert(mfaBackupCodes).values(hashedCodes);

  return {
    ...userData,
    totpSecret: secret.base32!,
    backupCodes,
  };
}

/**
 * Generate a valid TOTP code for a secret
 */
export function generateTotpCode(secret: string): string {
  return speakeasy.totp({
    secret,
    encoding: 'base32',
  });
}

/**
 * Create email verification token for user
 */
export async function createEmailVerificationToken(userId: string, email: string): Promise<string> {
  return await authService.generateEmailVerificationToken(userId, email);
}

/**
 * Create password reset token for user
 */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  return await authService.generatePasswordResetToken(email);
}
