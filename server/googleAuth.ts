import { serialize } from "cookie";
import rateLimit from "express-rate-limit";
import { OAuth2Client, type TokenPayload } from "google-auth-library";

import { createLogger } from "./logger";
import { userRepository } from "./repositories";
import { authService } from "./services/AuthService";


import type { Express } from "express";
const logger = createLogger({ module: 'auth' });
// Initialize Google OAuth2 client
let googleClient: OAuth2Client | null = null;
function getGoogleClient(): OAuth2Client {
  if (!googleClient) {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new Error("Environment variable GOOGLE_CLIENT_ID not provided");
    }
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}
/**
 * For testing only: allow injecting a custom OAuth client
 * @internal
 * @throws {Error} If called outside of test environment
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function _testOnly_setGoogleClient(client: OAuth2Client | null): void {
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
    throw new Error('_testOnly_setGoogleClient can only be called in test/development environments');
  }
  googleClient = client;
}
async function upsertUser(payload: TokenPayload): Promise<Record<string, unknown>> {
  try {
    // Get default tenant for new users
    const { getDb } = await import('./db');
    const { tenants } = await import('@shared/schema');
    const db = getDb();
    if (db == null) { throw new Error("Database not initialized"); }
    const [defaultTenant] = await db.select().from(tenants).limit(1);
    let tenantId = defaultTenant?.id;
    if (!tenantId) {
      logger.warn('No default tenant found in database, creating one automatically');
      const [newTenant] = await db.insert(tenants).values({
        name: 'Default Tenant'
      }).returning({ id: tenants.id });
      tenantId = newTenant.id;
    }
    const userData = {
      id: payload.sub,
      email: payload.email ?? "",
      firstName: payload.given_name ?? null,
      lastName: payload.family_name ?? null,
      profileImageUrl: payload.picture ?? null,
      defaultMode: 'easy' as const,
      tenantId: tenantId,
      tenantRole: (process.env.NODE_ENV === 'development' ? 'owner' : 'viewer') as 'owner' | 'viewer' | 'builder' | 'runner',
      authProvider: 'google' as const,
      emailVerified: true,
      lastPasswordChange: null
    };
    logger.debug({ userId: userData.id, email: userData.email, tenantId: tenantId }, 'Upserting user');
    await userRepository.upsert(userData);
    return userData;
  } catch (error) {
    logger.error({ err: error, userId: payload.sub }, 'Failed to upsert user during authentication');
    throw new Error("Failed to create or update user account");
  }
}
export async function verifyGoogleToken(token: string): Promise<TokenPayload> {
  try {
    const client = getGoogleClient();
    logger.debug({ tokenLength: token?.length }, 'Verifying Google token');
    const audience = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    if (!audience) { throw new Error("GOOGLE_CLIENT_ID is not set in environment variables"); }
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: audience,
    });
    const payload = ticket.getPayload();
    if (!payload) { throw new Error("Invalid token payload"); }
    if (!payload.email_verified) {
      logger.warn({ email: payload.email }, 'Email not verified by Google');
      throw new Error("Email not verified by Google");
    }
    return payload;
  } catch (error) {
    logger.error({ err: error }, 'Google token verification failed');
    throw error;
  }
}
// Rate limiting for authentication endpoint
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  message: { message: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
// Helper function to validate Origin/Referer
function validateOrigin(req: Express.Request): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const originHeader = req.get('Origin') ?? req.get('Referer');
  if (!originHeader) { return false; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const originUrl = new URL(originHeader);
    const allowedHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
    if (process.env.ALLOWED_ORIGIN) {
      const allowedOrigins = process.env.ALLOWED_ORIGIN.split(',').map(o => {
        try {
          return o.includes('://') ? new URL(o).hostname : o.trim();
        } catch { return o.trim(); }
      });
      allowedHosts.push(...allowedOrigins);
    }
    const validHosts = allowedHosts.filter(Boolean);
    return validHosts.some(host =>
      originUrl.hostname === host || originUrl.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}
// eslint-disable-next-line @typescript-eslint/require-await
export async function setupAuth(app: Express): Promise<void> {
  app.set("trust proxy", 1);
  // Session middleware REMOVED
  // Google OAuth2 login route - accepts ID token from frontend
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post("/api/auth/google", authRateLimit, async (req, res) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { token, idToken } = req.body;
      const googleToken = (token as string | undefined) ?? (idToken as string | undefined);
      if (!googleToken) {
        return res.status(400).json({ message: "ID token is required", error: "missing_token" });
      }
      // CSRF Protection: Validate Origin/Referer
      if (!validateOrigin(req)) {
        return res.status(403).json({ message: "Invalid request origin", error: "invalid_origin" });
      }
      // Verify and Upsert
      const payload = await verifyGoogleToken(googleToken);
      await upsertUser(payload);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const dbUser = await userRepository.findById(payload.sub);
      if (!dbUser) { throw new Error('User not found after upsert'); }

      // CHECK ACTIVE STATUS
      if (!dbUser.isActive) {
        logger.warn({ userId: dbUser.id, email: payload.email }, 'Login blocked: account inactive');
        return res.status(403).json({ message: "Account deactivated. Please contact support.", error: "account_deactivated" });
      }

      // Generate Tokens using AuthService
      const jwtToken = authService.createToken(dbUser);
      const refreshToken = await authService.createRefreshToken(dbUser.id, {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      // Set Refresh Token Cookie
      res.setHeader('Set-Cookie', serialize('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 * 30 // 30 days
      }));
      logger.info({ email: payload.email }, 'OAuth2 login successful');
      res.json({
        message: "Authentication successful",
        token: jwtToken,
        user: {
          id: payload.sub,
          email: payload.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
          tenantId: dbUser.tenantId,
          role: dbUser.role,
          tenantRole: dbUser.tenantRole,
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Google authentication failed');
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(401).json({ message: `Authentication failed: ${errorMessage}`, error: "auth_failed", details: errorMessage });
    }
  });
}