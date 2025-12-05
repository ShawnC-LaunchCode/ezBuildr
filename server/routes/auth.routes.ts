import type { Express, Request, Response } from "express";
import { userRepository, userCredentialsRepository } from "../repositories";
import { createLogger } from "../logger";
import {
  createToken,
  hashPassword,
  comparePassword,
  validateEmail,
  validatePasswordStrength
} from "../services/auth";
import { requireAuth, hybridAuth, optionalHybridAuth, type AuthRequest } from "../middleware/auth";
import { nanoid } from "nanoid";

const logger = createLogger({ module: 'auth-routes' });

/**
 * Register authentication-related routes
 * Supports both JWT-based auth (email/password) and session-based auth (Google OAuth)
 */
export function registerAuthRoutes(app: Express): void {
  // =====================================================================
  // EMAIL/PASSWORD AUTHENTICATION (JWT)
  // =====================================================================

  /**
   * POST /api/auth/register
   * Register a new user with email and password
   * Returns a JWT token on success
   */
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName, tenantId, tenantRole } = req.body;

      // Validate input
      if (!email || !password) {
        return res.status(400).json({
          message: 'Email and password are required',
          error: 'missing_fields',
        });
      }

      // Validate email format
      if (!validateEmail(email)) {
        return res.status(400).json({
          message: 'Invalid email format',
          error: 'invalid_email',
        });
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          message: passwordValidation.message,
          error: 'weak_password',
        });
      }

      // Check if user already exists
      const existingUser = await userRepository.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          message: 'User with this email already exists',
          error: 'user_exists',
        });
      }

      // Create user
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

      // Hash password and store credentials
      const passwordHash = await hashPassword(password);
      await userCredentialsRepository.createCredentials(userId, passwordHash);

      // Generate JWT token
      const token = createToken(user);

      logger.info({ userId: user.id, email: user.email }, 'User registered successfully');

      res.status(201).json({
        message: 'Registration successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          tenantId: user.tenantId,
          role: user.tenantRole,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Registration failed');
      res.status(500).json({
        message: 'Registration failed',
        error: 'internal_error',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/auth/login
   * Login with email and password
   * Returns a JWT token on success
   */
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      // Validate input
      if (!email || !password) {
        return res.status(400).json({
          message: 'Email and password are required',
          error: 'missing_fields',
        });
      }

      // Find user by email
      const user = await userRepository.findByEmail(email);
      if (!user) {
        return res.status(401).json({
          message: 'Invalid email or password',
          error: 'invalid_credentials',
        });
      }

      // Check if user uses local auth
      if (user.authProvider !== 'local') {
        return res.status(400).json({
          message: `This account uses ${user.authProvider} authentication. Please sign in with ${user.authProvider}.`,
          error: 'wrong_auth_provider',
        });
      }

      // Get user credentials
      const credentials = await userCredentialsRepository.findByUserId(user.id);
      if (!credentials) {
        return res.status(401).json({
          message: 'Invalid email or password',
          error: 'invalid_credentials',
        });
      }

      // Verify password
      const isPasswordValid = await comparePassword(password, credentials.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({
          message: 'Invalid email or password',
          error: 'invalid_credentials',
        });
      }

      // Generate JWT token
      const token = createToken(user);

      logger.info({ userId: user.id, email: user.email }, 'User logged in successfully');

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
        },
      });
    } catch (error) {
      logger.error({ error }, 'Login failed');
      res.status(500).json({
        message: 'Login failed',
        error: 'internal_error',
      });
    }
  });

  /**
   * GET /api/auth/me
   * Get current authenticated user
   * Supports both JWT and session-based authentication
   */
  app.get('/api/auth/me', hybridAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await userRepository.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

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
      logger.error({ error }, "Error fetching current user");
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  /**
   * POST /api/auth/logout
   * Logout (currently a no-op for JWT, but included for API consistency)
   * For session-based auth, this would clear the session
   */
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    // For JWT, logout is handled client-side by removing the token
    // For session auth, we destroy the session
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          logger.error({ err }, 'Session destruction failed');
          return res.status(500).json({
            message: 'Logout failed',
            error: 'session_destruction_failed'
          });
        }
        logger.info({ email: (req.session as any)?.passport?.user?.email }, 'User logged out');
        res.json({ message: 'Logout successful' });
      });
    } else {
      // No session to destroy (JWT or not logged in)
      logger.info('User logged out (no session)');
      res.json({ message: 'Logout successful' });
    }
  });

  // =====================================================================
  // GOOGLE OAUTH AUTHENTICATION (Session-based)
  // Note: Google OAuth routes are registered in googleAuth.ts via setupAuth()
  // =====================================================================

  /**
   * GET /api/auth/google
   * Redirects to Google OAuth (handled in googleAuth.ts)
   */

  /**
   * GET /api/auth/google/callback
   * Google OAuth callback (handled in googleAuth.ts)
   */

  // =====================================================================
  // DEVELOPMENT AUTHENTICATION HELPER
  // =====================================================================

  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    const devLoginHandler = async (req: Request, res: Response) => {
      try {
        // Create a test user for development
        const testUser = {
          id: "dev-user-123",
          email: "dev@example.com",
          firstName: "Dev",
          lastName: "User",
          profileImageUrl: null,
        };

        // Upsert the test user
        await userRepository.upsert(testUser);

        // Simulate authentication by setting up the session (Google auth format)
        const mockAuthUser = {
          claims: {
            sub: testUser.id,
            email: testUser.email,
            name: `${testUser.firstName} ${testUser.lastName}`,
            given_name: testUser.firstName,
            family_name: testUser.lastName,
            picture: testUser.profileImageUrl || undefined,
            exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
          },
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        };

        // Session fixation protection: regenerate session before login (same as Google auth)
        req.session.regenerate((err: unknown) => {
          if (err) {
            logger.error({ error: err }, 'Dev login session regeneration error');
            return res.status(500).json({ message: "Session creation failed" });
          }

          // Set up the session with new session ID
          req.session.user = mockAuthUser;

          // Save session before redirecting to avoid race condition
          req.session.save((saveErr: unknown) => {
            if (saveErr) {
              logger.error({ error: saveErr }, 'Dev login session save error');
              return res.status(500).json({ message: "Session save failed" });
            }

            // For GET requests, redirect to dashboard; for POST, return JSON
            if (req.method === 'GET') {
              res.redirect('/dashboard');
            } else {
              res.json({ message: "Development authentication successful", user: testUser });
            }
          });
        });
      } catch (error) {
        logger.error({ error }, "Dev login error");
        res.status(500).json({ message: "Failed to authenticate in dev mode" });
      }
    };

    // Support both GET and POST for dev login
    app.get('/api/auth/dev-login', devLoginHandler);
    app.post('/api/auth/dev-login', devLoginHandler);
  }

  // Legacy route for backward compatibility (uses session-based auth)
  app.get('/api/auth/user', optionalHybridAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      // Return null instead of 401 to avoid console errors
      if (!userId) {
        return res.json(null);
      }

      const user = await userRepository.findById(userId);
      if (!user) {
        // If we have a userId but can't find the user, that's a valid 404 or null
        return res.json(null);
      }

      res.json(user);
    } catch (error) {
      logger.error({ error }, "Error fetching user");
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // =====================================================================
  // JWT TOKEN ENDPOINT (for WebSocket/API authentication)
  // =====================================================================

  /**
   * GET /api/auth/token
   * Get a JWT token for the current authenticated session
   * Useful for WebSocket connections and API authentication
   * Requires existing session-based authentication (Google OAuth)
   */
  app.get('/api/auth/token', async (req: Request, res: Response) => {
    try {
      // Check for session-based authentication
      const sessionUser = req.session?.user || req.user;
      const userId = sessionUser?.claims?.sub || sessionUser?.id;

      if (!userId) {
        return res.status(401).json({
          message: 'Authentication required',
          error: 'unauthorized',
        });
      }

      // Fetch full user from database
      const user = await userRepository.findById(userId);
      if (!user) {
        return res.status(404).json({
          message: 'User not found',
          error: 'user_not_found',
        });
      }

      // Generate JWT token
      const token = createToken(user);

      logger.debug({ userId: user.id }, 'JWT token generated for session user');

      res.json({
        token,
        expiresIn: process.env.JWT_EXPIRY || '7d',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate JWT token');
      res.status(500).json({
        message: 'Failed to generate token',
        error: 'internal_error',
      });
    }
  });
}
