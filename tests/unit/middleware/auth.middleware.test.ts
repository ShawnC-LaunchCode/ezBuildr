import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";

import { UnauthorizedError } from "../../../server/errors/AuthErrors";
import {
  requireAuth,
  optionalAuth,
  hybridAuth,
  optionalHybridAuth,
  type AuthRequest
} from "../../../server/middleware/auth";
import { userRepository } from "../../../server/repositories";
import { authService } from "../../../server/services/AuthService";
import { parseCookies } from "../../../server/utils/cookies";

import type { Request, Response, NextFunction } from "express";

/**
 * Authentication Middleware Tests
 * Tests JWT, Cookie, and Hybrid authentication strategies
 */

// Mock dependencies
vi.mock("../../../server/services/AuthService", () => ({
  authService: {
    extractTokenFromHeader: vi.fn(),
    verifyToken: vi.fn(),
    looksLikeJwt: vi.fn(),
    validateRefreshToken: vi.fn(),
    createToken: vi.fn(), // Added for optionalAuth test
  }
}));

vi.mock("../../../server/repositories", () => ({
  userRepository: {
    findById: vi.fn(),
  }
}));

vi.mock("../../../server/utils/cookies", () => ({
  parseCookies: vi.fn(),
}));

describe("Auth Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    tenantId: 'tenant-1',
    role: 'creator',
    tenantRole: 'owner',
  };

  const mockPayload = {
    userId: mockUser.id,
    email: mockUser.email,
    tenantId: mockUser.tenantId,
    role: mockUser.role,
  };

  beforeAll(() => {
    vi.stubEnv('JWT_SECRET', 'test-secret');
  });

  beforeEach(() => {
    vi.clearAllMocks();

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
      const token = "valid-token";
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(token);
      vi.mocked(authService.verifyToken).mockReturnValue(mockPayload as any);

      mockReq.headers = { authorization: `Bearer ${token}` };

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();

      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(mockUser.id);
      expect(authReq.userEmail).toBe(mockUser.email);
    });

    it("should return 401 for missing token", async () => {
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null);

      mockReq.headers = {};

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Authentication required',
            code: 'AUTH_008'
          })
        })
      );
    });

    it("should return 401 for invalid token", async () => {
      const token = "invalid-token";
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(token);
      vi.mocked(authService.verifyToken).mockImplementation(() => {
        throw new UnauthorizedError("Invalid token");
      });

      mockReq.headers = {
        authorization: 'Bearer invalid-token',
      };

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("should return 401 for expired token", async () => {
      const token = "expired-token";
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(token);
      vi.mocked(authService.verifyToken).mockImplementation(() => {
        throw new UnauthorizedError("Token expired");
      });

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("should extract token without Bearer prefix", async () => {
      const token = "token-without-bearer";
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(token);
      vi.mocked(authService.verifyToken).mockReturnValue(mockPayload as any);

      mockReq.headers = {
        authorization: token, // No Bearer prefix
      };

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(mockUser.id);
    });
  });

  describe("optionalAuth", () => {
    it("should authenticate with valid token", async () => {
      const token = "valid-token";
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(token);
      vi.mocked(authService.verifyToken).mockReturnValue(mockPayload as any);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await optionalAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(mockUser.id);
    });

    it("should proceed without auth when no token provided", async () => {
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null);

      mockReq.headers = {};

      await optionalAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBeUndefined();
    });

    it("should proceed even with invalid token", async () => {
      const token = "invalid-token";
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(token);
      vi.mocked(authService.verifyToken).mockImplementation(() => {
        throw new UnauthorizedError("Invalid token");
      });

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
      const token = "valid-jwt";
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(token);
      vi.mocked(authService.looksLikeJwt).mockReturnValue(true);
      vi.mocked(authService.verifyToken).mockReturnValue(mockPayload as any);

      mockReq.headers = { authorization: `Bearer ${token}` };
      mockReq.method = 'POST';

      await hybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(mockUser.id);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it("should authenticate with refresh token cookie for GET requests", async () => {
      const refreshToken = "valid-refresh-token";
      mockReq.method = "GET";
      mockReq.headers = { cookie: `refresh_token=${refreshToken}` };
      vi.mocked(parseCookies).mockReturnValue({ refresh_token: refreshToken });
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null); // No JWT
      vi.mocked(authService.validateRefreshToken).mockResolvedValue(mockUser.id);
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser as any);

      await hybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(authService.validateRefreshToken).toHaveBeenCalledWith(refreshToken);
      expect(userRepository.findById).toHaveBeenCalledWith(mockUser.id);
      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(mockUser.id);
    });

    it("should reject cookie auth for POST requests", async () => {
      const refreshToken = "some-token";
      mockReq.headers = { cookie: `refresh_token=${refreshToken}` };
      mockReq.method = 'POST'; // Mutation method
      vi.mocked(parseCookies).mockReturnValue({ refresh_token: refreshToken });
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null); // No JWT

      await hybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(authService.validateRefreshToken).not.toHaveBeenCalled(); // Should not attempt to validate
    });

    it("should prioritize JWT over cookie when both present", async () => {
      const jwtToken = "jwt-token-user1";
      const refreshToken = "refresh-token-user2";
      const mockUser2 = { ...mockUser, id: 'user-456', email: 'user2@example.com' };

      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(jwtToken);
      vi.mocked(authService.looksLikeJwt).mockReturnValue(true);
      vi.mocked(authService.verifyToken).mockReturnValue(mockPayload as any); // Payload for mockUser
      vi.mocked(parseCookies).mockReturnValue({ refresh_token: refreshToken });
      vi.mocked(authService.validateRefreshToken).mockResolvedValue(mockUser2.id); // Would resolve to user2 if used
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser2 as any);

      mockReq.headers = {
        authorization: `Bearer ${jwtToken}`,
        cookie: `refresh_token=${refreshToken}`,
      };
      mockReq.method = 'GET';

      await hybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      // Should use JWT (mockUser), not cookie (mockUser2)
      expect(authReq.userId).toBe(mockUser.id);
      expect(authService.validateRefreshToken).not.toHaveBeenCalled(); // Cookie validation should not be attempted
    });

    it("should allow cookie auth only for safe methods", async () => {
      const refreshToken = "valid-refresh";
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null); // No JWT
      vi.mocked(authService.validateRefreshToken).mockResolvedValue(mockUser.id);
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser as any);

      const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
      const unsafeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

      // Test safe methods
      for (const method of safeMethods) {
        const req = {
          ...mockReq,
          method,
          headers: { cookie: `refresh_token=${refreshToken}` },
        };
        vi.mocked(parseCookies).mockReturnValue({ refresh_token: refreshToken });
        const res = { ...mockRes, status: vi.fn(() => ({ json: vi.fn() })) };
        const next = vi.fn();

        await hybridAuth(req as unknown as Request, res as unknown as Response, next);
        expect(next).toHaveBeenCalled();
        expect(authService.validateRefreshToken).toHaveBeenCalledWith(refreshToken);
        expect(userRepository.findById).toHaveBeenCalledWith(mockUser.id);
        vi.clearAllMocks(); // Clear mocks for next iteration
        vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null);
        vi.mocked(authService.validateRefreshToken).mockResolvedValue(mockUser.id);
        vi.mocked(userRepository.findById).mockResolvedValue(mockUser as any);
      }

      // Test unsafe methods
      for (const method of unsafeMethods) {
        const req = {
          ...mockReq,
          method,
          headers: { cookie: `refresh_token=${refreshToken}` },
        };
        vi.mocked(parseCookies).mockReturnValue({ refresh_token: refreshToken });
        const res = {
          status: vi.fn(() => ({ json: vi.fn() })),
        };
        const next = vi.fn();

        await hybridAuth(req as unknown as Request, res as unknown as Response, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(authService.validateRefreshToken).not.toHaveBeenCalled();
        vi.clearAllMocks(); // Clear mocks for next iteration
        vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null);
      }
    });

    it("should return 401 when no auth provided", async () => {
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null);
      vi.mocked(parseCookies).mockReturnValue({});

      mockReq.headers = {};

      await hybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe("optionalHybridAuth", () => {
    it("should authenticate with JWT", async () => {
      const token = "valid-jwt";
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(token);
      vi.mocked(authService.looksLikeJwt).mockReturnValue(true);
      vi.mocked(authService.verifyToken).mockReturnValue(mockPayload as any);

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      await optionalHybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(mockUser.id);
    });

    it("should authenticate with cookie for GET", async () => {
      const refreshToken = "valid-refresh-token";
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null); // No JWT
      vi.mocked(parseCookies).mockReturnValue({ refresh_token: refreshToken });
      vi.mocked(authService.validateRefreshToken).mockResolvedValue(mockUser.id);
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser as any);

      mockReq.headers = {
        cookie: `refresh_token=${refreshToken}`,
      };
      mockReq.method = 'GET';

      await optionalHybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBe(mockUser.id);
    });

    it("should proceed without auth when none provided", async () => {
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null);
      vi.mocked(parseCookies).mockReturnValue({});

      mockReq.headers = {};

      await optionalHybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBeUndefined();
    });

    it("should proceed even with invalid auth", async () => {
      const token = "invalid-token";
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(token);
      vi.mocked(authService.looksLikeJwt).mockReturnValue(true);
      vi.mocked(authService.verifyToken).mockImplementation(() => {
        throw new UnauthorizedError("Invalid token");
      });
      vi.mocked(parseCookies).mockReturnValue({ refresh_token: "invalid-refresh" });
      vi.mocked(authService.validateRefreshToken).mockResolvedValue(null); // Invalid refresh token

      mockReq.headers = {
        authorization: 'Bearer invalid',
        cookie: 'refresh_token=invalid-refresh',
      };

      await optionalHybridAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const authReq = mockReq as unknown as AuthRequest;
      expect(authReq.userId).toBeUndefined();
    });
  });

  describe("Security Edge Cases", () => {
    it("should not allow token tampering", async () => {
      const tamperedToken = "valid-token.tampered";
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(tamperedToken);
      vi.mocked(authService.verifyToken).mockImplementation(() => {
        throw new UnauthorizedError("Invalid signature");
      });

      mockReq.headers = {
        authorization: `Bearer ${tamperedToken}`,
      };

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("should not allow cookie auth for mutations (CSRF protection)", async () => {
      const refreshToken = "some-token";
      const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

      for (const method of mutationMethods) {
        const req = {
          ...mockReq,
          method,
          headers: { cookie: `refresh_token=${refreshToken}` },
        };
        vi.mocked(parseCookies).mockReturnValue({ refresh_token: refreshToken });
        vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null); // No JWT
        const res = {
          status: vi.fn(() => ({ json: vi.fn() })),
        };
        const next = vi.fn();

        await hybridAuth(req as unknown as Request, res as unknown as Response, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(authService.validateRefreshToken).not.toHaveBeenCalled();
        vi.clearAllMocks(); // Clear mocks for next iteration
        vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null);
      }
    });

    it("should reject malformed JWT", async () => {
      const malformedToken = 'not.a.valid.token';
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(malformedToken);
      vi.mocked(authService.verifyToken).mockImplementation(() => {
        throw new UnauthorizedError("Malformed token");
      });

      mockReq.headers = {
        authorization: `Bearer ${malformedToken}`,
      };

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("should handle missing authorization header gracefully", async () => {
      vi.mocked(authService.extractTokenFromHeader).mockReturnValue(null); // No authorization header

      mockReq.headers = {}; // No authorization header

      await requireAuth(mockReq as unknown as Request, mockRes as unknown as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });
});
