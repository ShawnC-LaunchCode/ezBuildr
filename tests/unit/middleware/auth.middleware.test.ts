import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  requireAuth,
  optionalAuth,
  hybridAuth,
  optionalHybridAuth,
  type AuthRequest
} from "../../../server/middleware/auth";
import { authService } from "../../../server/services/AuthService";
import { createVerifiedUser } from "../../helpers/testUtils";

/**
 * Authentication Middleware Tests
 * Tests JWT, Cookie, and Hybrid authentication strategies
 */

describe("Auth Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    vi.stubEnv('JWT_SECRET', 'test-secret');
    vi.clearAllMocks();
  });

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn(() => ({ json: jsonMock }));

    mockReq = {
      headers: {},
      method: 'GET',
      path: '/test',
    };

    mockRes = {
      status: statusMock as any,
      json: jsonMock as any,
    };

    mockNext = vi.fn();
  });

  describe("requireAuth", () => {
    it("should authenticate with valid JWT token", async () => {
      const { user } = await createVerifiedUser();
      const token = authService.createToken(user);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();

      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(user.id);
      expect(authReq.userEmail).toBe(user.email);
    });

    it("should return 401 for missing token", async () => {
      mockReq.headers = {};

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication required',
          error: 'missing_token'
        })
      );
    });

    it("should return 401 for invalid token", async () => {
      mockReq.headers = {
        authorization: 'Bearer invalid-token',
      };

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("should return 401 for expired token", async () => {
      const { user } = await createVerifiedUser();

      // Create expired token (manually using jwt.sign with past expiry)
      const jwt = await import('jsonwebtoken');
      const expiredToken = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET!,
        { expiresIn: '0s' }
      );

      // Wait a bit to ensure expiry
      await new Promise(resolve => setTimeout(resolve, 100));

      mockReq.headers = {
        authorization: `Bearer ${expiredToken}`,
      };

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("should extract token without Bearer prefix", async () => {
      const { user } = await createVerifiedUser();
      const token = authService.createToken(user);

      mockReq.headers = {
        authorization: token, // No Bearer prefix
      };

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(user.id);
    });
  });

  describe("optionalAuth", () => {
    it("should authenticate with valid token", async () => {
      const { user } = await createVerifiedUser();
      const token = authService.createToken(user);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await optionalAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(user.id);
    });

    it("should proceed without auth when no token provided", async () => {
      mockReq.headers = {};

      await optionalAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBeUndefined();
    });

    it("should proceed even with invalid token", async () => {
      mockReq.headers = {
        authorization: 'Bearer invalid-token',
      };

      await optionalAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBeUndefined();
    });
  });

  describe("hybridAuth", () => {
    it("should authenticate with JWT Bearer token", async () => {
      const { user } = await createVerifiedUser();
      const token = authService.createToken(user);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };
      mockReq.method = 'POST';

      await hybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(user.id);
    });

    it("should authenticate with refresh token cookie for GET requests", async () => {
      const { user, userId } = await createVerifiedUser();
      const refreshToken = await authService.createRefreshToken(userId);

      mockReq.headers = {
        cookie: `refresh_token=${refreshToken}`,
      };
      mockReq.method = 'GET';

      await hybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(user.id);
    });

    it("should reject cookie auth for POST requests", async () => {
      const { userId } = await createVerifiedUser();
      const refreshToken = await authService.createRefreshToken(userId);

      mockReq.headers = {
        cookie: `refresh_token=${refreshToken}`,
      };
      mockReq.method = 'POST'; // Mutation method

      await hybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("should prioritize JWT over cookie when both present", async () => {
      const { user: user1 } = await createVerifiedUser();
      const { userId: userId2 } = await createVerifiedUser();

      const jwtToken = authService.createToken(user1);
      const refreshToken = await authService.createRefreshToken(userId2);

      mockReq.headers = {
        authorization: `Bearer ${jwtToken}`,
        cookie: `refresh_token=${refreshToken}`,
      };
      mockReq.method = 'GET';

      await hybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      // Should use JWT (user1), not cookie (user2)
      expect(authReq.userId).toBe(user1.id);
    });

    it("should allow cookie auth only for safe methods", async () => {
      const { userId } = await createVerifiedUser();
      const refreshToken = await authService.createRefreshToken(userId);

      const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
      const unsafeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

      // Test safe methods
      for (const method of safeMethods) {
        const req = {
          ...mockReq,
          method,
          headers: { cookie: `refresh_token=${refreshToken}` },
        };
        const res = { ...mockRes };
        const next = vi.fn();

        await hybridAuth(req as unknown as Request, res as unknown as Response, next);
        expect(next).toHaveBeenCalled();
      }

      // Test unsafe methods
      for (const method of unsafeMethods) {
        const req = {
          ...mockReq,
          method,
          headers: { cookie: `refresh_token=${refreshToken}` },
        };
        const res = {
          status: vi.fn(() => ({ json: vi.fn() })),
        };
        const next = vi.fn();

        await hybridAuth(req as unknown as Request, res as unknown as Response, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
      }
    });

    it("should return 401 when no auth provided", async () => {
      mockReq.headers = {};

      await hybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe("optionalHybridAuth", () => {
    it("should authenticate with JWT", async () => {
      const { user } = await createVerifiedUser();
      const token = authService.createToken(user);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await optionalHybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(user.id);
    });

    it("should authenticate with cookie for GET", async () => {
      const { userId } = await createVerifiedUser();
      const refreshToken = await authService.createRefreshToken(userId);

      mockReq.headers = {
        cookie: `refresh_token=${refreshToken}`,
      };
      mockReq.method = 'GET';

      await optionalHybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBeDefined();
    });

    it("should proceed without auth when none provided", async () => {
      mockReq.headers = {};

      await optionalHybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBeUndefined();
    });

    it("should proceed even with invalid auth", async () => {
      mockReq.headers = {
        authorization: 'Bearer invalid',
      };

      await optionalHybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBeUndefined();
    });
  });

  describe("Security Edge Cases", () => {
    it("should not allow token tampering", async () => {
      const { user } = await createVerifiedUser();
      const validToken = authService.createToken(user);

      // Tamper with token
      const tamperedToken = validToken.slice(0, -5) + 'XXXXX';

      mockReq.headers = {
        authorization: `Bearer ${tamperedToken}`,
      };

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("should not allow cookie auth for mutations (CSRF protection)", async () => {
      const { userId } = await createVerifiedUser();
      const refreshToken = await authService.createRefreshToken(userId);

      const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

      for (const method of mutationMethods) {
        const req = {
          ...mockReq,
          method,
          headers: { cookie: `refresh_token=${refreshToken}` },
        };
        const res = {
          status: vi.fn(() => ({ json: vi.fn() })),
        };
        const next = vi.fn();

        await hybridAuth(req as unknown as Request, res as unknown as Response, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
      }
    });

    it("should reject malformed JWT", async () => {
      mockReq.headers = {
        authorization: 'Bearer not.a.valid.token',
      };

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("should handle missing authorization header gracefully", async () => {
      mockReq.headers = {}; // No authorization header

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });
});
