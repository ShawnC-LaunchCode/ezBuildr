import { OAuth2Client, type TokenPayload } from "google-auth-library";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import createMemoryStore from "memorystore";
import rateLimit from "express-rate-limit";
import { userRepository } from "./repositories";
import { createLogger } from "./logger";
import { templateSharingService } from "./services/TemplateSharingService";

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

// For testing: allow injecting a custom OAuth client
export function __setGoogleClient(client: OAuth2Client | null) {
  googleClient = client;
}

export function getSession() {
  // Session lifetime configuration
  // Note: connect-pg-simple uses TTL in SECONDS, cookie maxAge uses MILLISECONDS
  const sessionTtlSeconds = 365 * 24 * 60 * 60; // 1 year in seconds (31,536,000)

  // Cookie maxAge must fit in 32-bit signed integer (max 2,147,483,647 ms = ~24.8 days)
  // Use 24 days as a safe cookie lifetime that fits in 32-bit integer
  const cookieMaxAgeMs = 24 * 24 * 60 * 60 * 1000; // 24 days in milliseconds (2,073,600,000)

  // Use in-memory session store for tests to avoid database connection issues
  let sessionStore;
  if (process.env.NODE_ENV === 'test') {
    const MemoryStore = createMemoryStore(session);
    sessionStore = new MemoryStore({
      checkPeriod: cookieMaxAgeMs, // Use ms for memory store
    });
  } else {
    const pgStore = connectPg(session);
    sessionStore = new pgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: false,
      ttl: sessionTtlSeconds, // Use SECONDS for pg store
      tableName: "sessions",
    });
  }

  // Detect cross-origin deployment scenario
  // This occurs when ALLOWED_ORIGIN is set and differs from the current app domain
  const isCrossOrigin = process.env.NODE_ENV === 'production' &&
                       process.env.ALLOWED_ORIGIN &&
                       !process.env.ALLOWED_ORIGIN.includes('localhost') &&
                       !process.env.ALLOWED_ORIGIN.includes('127.0.0.1') &&
                       !process.env.ALLOWED_ORIGIN.includes('0.0.0.0');

  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: 'survey-session', // Custom cookie name for additional security
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      // For cross-origin deployments, use SameSite=None to allow cross-origin cookies
      // For same-origin deployments, use SameSite=lax for CSRF protection
      sameSite: isCrossOrigin ? 'none' : 'lax',
      maxAge: cookieMaxAgeMs, // 24 days (fits in 32-bit integer)
      // Additional cookie settings for cross-origin scenarios
      ...(isCrossOrigin && {
        domain: undefined, // Let browser determine the correct domain
        path: '/'  // Ensure cookie is available site-wide
      })
    },
  });
}

function updateUserSession(user: any, payload: TokenPayload) {
  user.claims = {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    given_name: payload.given_name,
    family_name: payload.family_name,
    exp: payload.exp,
  };
  user.expires_at = payload.exp;
}

async function upsertUser(payload: TokenPayload) {
  try {
    // Get default tenant for new users
    const { getDb } = await import('./db');
    const { tenants } = await import('@shared/schema');
    const db = getDb();
    const [defaultTenant] = await db.select().from(tenants).limit(1);

    if (!defaultTenant) {
      logger.error('No default tenant found in database');
      throw new Error("System not properly configured - no tenant found");
    }

    const userData = {
      id: payload.sub!,
      email: payload.email || "",
      firstName: payload.given_name || "",
      lastName: payload.family_name || "",
      profileImageUrl: payload.picture || null,
      defaultMode: 'easy' as const,
      tenantId: defaultTenant.id, // Assign default tenant to new users
    };
    logger.debug({ userId: userData.id, email: userData.email, tenantId: defaultTenant.id }, 'Upserting user');
    await userRepository.upsert(userData);
    logger.info({ userId: userData.id }, 'User upserted successfully');
  } catch (error) {
    logger.error(
      {
        err: error,
        userId: payload.sub,
        userEmail: payload.email,
      },
      'Failed to upsert user during authentication'
    );
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
    if (!payload) {
      logger.error('Token verification failed: Empty payload');
      throw new Error("Invalid token payload");
    }

    logger.debug(
      {
        email: payload.email,
        emailVerified: payload.email_verified,
        audience: payload.aud,
        issuer: payload.iss,
      },
      'Token payload received'
    );

    // Check if email is verified for additional security
    if (!payload.email_verified) {
      logger.warn({ email: payload.email }, 'Email not verified by Google');
      throw new Error("Email not verified by Google");
    }

    logger.info({ email: payload.email }, 'Token verified successfully');
    return payload;
  } catch (error) {
    const errorContext: any = { err: error };

    // Add hints for common errors
    if (error instanceof Error) {
      if (error.message.includes('audience')) {
        errorContext.hint = 'Token audience mismatch - check GOOGLE_CLIENT_ID configuration';
      } else if (error.message.includes('expired')) {
        errorContext.hint = 'Token expired - user needs to re-authenticate';
      } else if (error.message.includes('issuer')) {
        errorContext.hint = 'Invalid issuer - token may not be from Google';
      }
    }

    logger.error(errorContext, 'Google token verification failed');
    throw error;
  }
}

// Rate limiting for authentication endpoint
// Disable rate limiting in test mode to allow integration tests to run
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 10, // much higher limit in test mode
  message: {
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper function to validate Origin/Referer for CSRF protection
function validateOrigin(req: any): boolean {
  const origin = req.get('Origin') || req.get('Referer');
  if (!origin) return false;
  
  try {
    const originUrl = new URL(origin);
    const allowedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0'
    ];
    
    // Add ALLOWED_ORIGIN environment variable (expecting hostname-only format)
    if (process.env.ALLOWED_ORIGIN) {
      // Split by comma for multiple allowed origins and normalize to hostnames
      const allowedOrigins = process.env.ALLOWED_ORIGIN.split(',').map(origin => {
        const trimmed = origin.trim();
        try {
          // If it contains protocol, extract hostname
          if (trimmed.includes('://')) {
            return new URL(trimmed).hostname;
          }
          // Otherwise treat as hostname
          return trimmed;
        } catch {
          // If URL parsing fails, treat as hostname
          return trimmed;
        }
      });
      allowedHosts.push(...allowedOrigins);
    }
    
    // Remove falsy values and check against origin hostname
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
  app.use(getSession());

  // Google OAuth2 login route - accepts ID token from frontend
  app.post("/api/auth/google", authRateLimit, async (req, res) => {
    try {
      const { token, idToken } = req.body;
      const googleToken = token || idToken; // Accept both 'token' and 'idToken' for compatibility

      logger.info(
        {
          hasToken: !!googleToken,
          origin: req.get('Origin'),
          ip: req.ip,
        },
        'OAuth2 login attempt'
      );

      if (!googleToken) {
        logger.warn('OAuth2 login failed: No token provided');
        return res.status(400).json({
          message: "ID token is required",
          error: "missing_token"
        });
      }

      // CSRF Protection: Validate Origin/Referer
      if (!validateOrigin(req)) {
        logger.warn(
          {
            origin: req.get('Origin'),
            referer: req.get('Referer'),
          },
          'OAuth2 login failed: Invalid origin'
        );
        return res.status(403).json({
          message: "Invalid request origin",
          error: "invalid_origin",
          details: {
            receivedOrigin: req.get('Origin'),
            receivedReferer: req.get('Referer'),
            allowedOrigins: process.env.ALLOWED_ORIGIN
          }
        });
      }

      // Verify the Google ID token
      const payload = await verifyGoogleToken(googleToken);

      // Upsert user in database
      await upsertUser(payload);

      // Fetch full user data from database (includes tenantId)
      const dbUser = await userRepository.findById(payload.sub!);

      if (!dbUser) {
        logger.error({ userId: payload.sub }, 'User not found after upsert');
        throw new Error('Failed to retrieve user data');
      }

      // Create user session data with both OAuth claims and database fields
      const user: any = {
        id: dbUser.id,
        email: dbUser.email,
        tenantId: dbUser.tenantId,
        tenantRole: dbUser.tenantRole,
        role: dbUser.role,
        defaultMode: dbUser.defaultMode,
      };
      updateUserSession(user, payload);

      // Accept any pending template shares for this user's email
      try {
        const userForSharing = {
          id: payload.sub!,
          email: payload.email!,
          fullName: payload.name || null,
          firstName: payload.given_name || null,
          lastName: payload.family_name || null,
          profileImageUrl: payload.picture || null,
          tenantId: null,
          tenantRole: null,
          authProvider: 'google' as const,
          defaultMode: 'easy' as const,
          role: 'creator' as const, // Default role
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await templateSharingService.acceptPendingOnLogin(userForSharing);
        logger.debug({ email: payload.email }, 'Accepted pending template shares');
      } catch (error) {
        // Don't fail login if this fails
        logger.warn({ err: error, email: payload.email }, 'Failed to accept pending template shares');
      }

      // Session fixation protection: regenerate session before login
      req.session.regenerate((err) => {
        if (err) {
          logger.error({ err }, 'Session regeneration failed');
          return res.status(500).json({ message: "Session creation failed" });
        }

        // Set up the session with new session ID
        (req as any).user = user;
        (req.session as any).user = user;

        logger.info({ email: payload.email }, 'OAuth2 login successful');
        res.json({
          message: "Authentication successful",
          user: {
            id: payload.sub,
            email: payload.email,
            firstName: payload.given_name,
            lastName: payload.family_name,
            profileImageUrl: payload.picture,
          }
        });
      });
    } catch (error) {
      // Enhanced error logging with full details
      let errorCode = "unknown_error";
      let errorMessage = "Authentication failed";
      let statusCode = 401;

      if (error instanceof Error) {
        errorMessage = error.message;

        // Categorize errors for better debugging
        if (error.message.includes('Token used too late') || error.message.includes('expired')) {
          errorCode = "token_expired";
          errorMessage = "Google token has expired. Please try signing in again.";
        } else if (error.message.includes('Invalid token signature') || error.message.includes('Invalid token')) {
          errorCode = "invalid_token_signature";
          errorMessage = "Invalid Google token. Please try signing in again.";
        } else if (error.message.includes('Wrong number of segments in token') || error.message.includes('JWT')) {
          errorCode = "malformed_token";
          errorMessage = "Malformed Google token. Please try signing in again.";
        } else if (error.message.includes('audience')) {
          errorCode = "audience_mismatch";
          errorMessage = "Token audience mismatch. Please ensure your Google OAuth Client ID is correctly configured.";
          statusCode = 500; // This is a configuration error
        } else if (error.message.includes('issuer')) {
          errorCode = "invalid_issuer";
          errorMessage = "Token issuer invalid. The token may not be from Google.";
        } else if (error.message.includes('Email not verified')) {
          errorCode = "email_not_verified";
          errorMessage = "Your Google account email is not verified. Please verify your email with Google first.";
          statusCode = 403;
        }
      }

      logger.error(
        {
          err: error,
          errorCode,
          origin: req.get('Origin'),
        },
        'Google authentication failed'
      );

      res.status(statusCode).json({
        message: errorMessage,
        error: errorCode,
        ...(process.env.NODE_ENV === 'development' && {
          details: error instanceof Error ? error.message : String(error)
        })
      });
    }
  });

  // Logout route
  app.post("/api/auth/logout", (req, res) => {
    const user = (req.session as any)?.user;
    req.session.destroy((err) => {
      if (err) {
        logger.error({ err }, 'Session destruction failed');
        return res.status(500).json({ message: "Logout failed" });
      }
      logger.info({ email: user?.claims?.email }, 'User logged out');
      res.clearCookie('survey-session'); // Clear the session cookie
      res.json({ message: "Logout successful" });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = (req.session as any)?.user || req.user;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Note: Google OAuth tokens expire after ~1 hour, but we allow sessions to persist
  // for the full session TTL (365 days). The session itself is the authentication proof.
  // If stricter security is needed, uncomment the expiration check below:
  //
  // const now = Math.floor(Date.now() / 1000);
  // if (user.expires_at && now > user.expires_at) {
  //   return res.status(401).json({ message: "Token expired" });
  // }

  // Set user on request for backward compatibility
  (req as any).user = user;
  next();
};

// Helper function to get authenticated user from request
export function getAuthenticatedUser(req: any) {
  return (req.session as any)?.user || req.user;
}