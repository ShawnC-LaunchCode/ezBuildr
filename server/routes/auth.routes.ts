import type { Express, Request, Response } from "express";
import { userRepository } from "../repositories";
import { isAuthenticated } from "../googleAuth";
import { createLogger } from "../logger";

const logger = createLogger({ module: 'auth-routes' });

/**
 * Register authentication-related routes
 */
export function registerAuthRoutes(app: Express): void {
  // Development authentication helper (for development and testing)
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
            picture: testUser.profileImageUrl,
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
          req.user = mockAuthUser;
          req.session.user = mockAuthUser;

          // For GET requests, redirect to dashboard; for POST, return JSON
          if (req.method === 'GET') {
            res.redirect('/dashboard');
          } else {
            res.json({ message: "Development authentication successful", user: testUser });
          }
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

  // Get current authenticated user
  app.get('/api/auth/user', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const user = await userRepository.findById(userId);
      res.json(user);
    } catch (error) {
      logger.error({ error }, "Error fetching user");
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
