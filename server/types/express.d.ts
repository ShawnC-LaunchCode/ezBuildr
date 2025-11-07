/**
 * TypeScript declarations for Express extensions
 * Augments Express types with custom properties used throughout the application
 */

import "express-session";

declare global {
  namespace Express {
    /**
     * User object attached to request after authentication
     */
    interface User {
      claims: {
        sub: string;
        email: string;
        name?: string;
        picture?: string;
        given_name?: string;
        family_name?: string;
        exp?: number;
        [key: string]: string | number | boolean | undefined;
      };
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
    }

    /**
     * Augment Request interface to include user and userId
     */
    interface Request {
      user?: User;
      userId?: string;
      adminUser?: {
        id: string;
        email: string;
        role: string;
        firstName: string | null;
        lastName: string | null;
        profileImageUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
      };
    }
  }
}

declare module "express-session" {
  interface SessionData {
    user?: Express.User;
  }
}
