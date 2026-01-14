import { serialize } from "cookie";
import rateLimit from "express-rate-limit";
import { OAuth2Client, type TokenPayload } from "google-auth-library";

import { createLogger } from "./logger";
import { userRepository } from "./repositories";
import { authService } from "./services/AuthService";
import { templateSharingService } from "./services/TemplateSharingService";

import type { AppUser } from "./types";
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
export function _testOnly_setGoogleClient(client: OAuth2Client | null) {
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
    throw new Error('_testOnly_setGoogleClient can only be called in test/development environments');
  }
  googleClient = client;
}

async function upsertUser(payload: TokenPayload) {
  try {
    // Get default tenant for new users
    const { getDb } = await import('./db');
    const { tenants } = await import('@shared/schema');
    const db = getDb();
    if (!db) {throw new Error("Database not initialized");}
    const [defaultTenant] = await db.select().from(tenants).limit(1);

    if (!defaultTenant) {
      logger.error('No default tenant found in database');
      throw new Error("System not properly configured - no tenant found");
    }

    const userData = {
      id: payload.sub,
      email: payload.email || "",
      firstName: payload.given_name || null,
      lastName: payload.family_name || null,
      profileImageUrl: payload.picture || null,
      defaultMode: 'easy' as const,
      tenantId: defaultTenant.id,
      tenantRole: 'viewer' as const,
      authProvider: 'google' as const,
      emailVerified: true,
      lastPasswordChange: null
    };
    logger.debug({ userId: userData.id, email: userData.email, tenantId: defaultTenant.id }, 'Upserting user');
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

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {throw new Error("Invalid token payload");}

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
function validateOrigin(req: any): boolean {
  const origin = req.get('Origin') || req.get('Referer');
  if (!origin) {return false;}

  try {
    const originUrl = new URL(origin);
    const allowedHosts = ['localhost', '127.0.0.1', '0.0.0.0'];

    if (process.env.ALLOWED_ORIGIN) {
      const allowedOrigins = process.env.ALLOWED_ORIGIN.split(',').map(origin => {
        try {
          return origin.includes('://') ? new URL(origin).hostname : origin.trim();
        } catch { return origin.trim(); }
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

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  // Session middleware REMOVED

  // Google OAuth2 login route - accepts ID token from frontend
  app.post("/api/auth/google", authRateLimit, async (req, res) => {
    try {
      const { token, idToken } = req.body;
      const googleToken = token || idToken;

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

      const dbUser = await userRepository.findById(payload.sub);
      if (!dbUser) {throw new Error('User not found after upsert');}

      // Accept pending shares
      try {
        await templateSharingService.acceptPendingOnLogin({ ...dbUser, authProvider: 'google' } as any);
      } catch (e) {
        logger.warn('Failed to accept pending template shares');
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
      res.status(401).json({ message: "Authentication failed", error: "auth_failed" });
    }
  });
}
