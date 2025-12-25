import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from 'express';
import {
  hasPermission,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireRole,
  requireOwner,
  requireBuilder,
  requireRunner,
  getUserPermissions,
  type UserRole,
  type Permission,
} from '../../../server/middleware/rbac';
import type { AuthRequest } from '../../../server/middleware/auth';

/**
 * RBAC Middleware Unit Tests
 * Tests role-based access control functions and middleware
 */
describe("RBAC Middleware", () => {
  describe("hasPermission()", () => {
    it("should return false for null role", () => {
      expect(hasPermission(null, 'workflow:create')).toBe(false);
    });

    it("should return false for undefined role", () => {
      expect(hasPermission(undefined, 'workflow:create')).toBe(false);
    });

    it("should allow owner to access all permissions (wildcard)", () => {
      expect(hasPermission('owner', 'workflow:create')).toBe(true);
      expect(hasPermission('owner', 'workflow:delete')).toBe(true);
      expect(hasPermission('owner', 'team:invite')).toBe(true);
      expect(hasPermission('owner', 'tenant:manage-users')).toBe(true);
    });

    it("should allow builder to create workflows", () => {
      expect(hasPermission('builder', 'workflow:create')).toBe(true);
      expect(hasPermission('builder', 'workflow:edit')).toBe(true);
      expect(hasPermission('builder', 'workflow:view')).toBe(true);
    });

    it("should deny builder from deleting workflows", () => {
      expect(hasPermission('builder', 'workflow:delete')).toBe(false);
    });

    it("should allow runner to view and run workflows", () => {
      expect(hasPermission('runner', 'workflow:view')).toBe(true);
      expect(hasPermission('runner', 'workflow:run')).toBe(true);
    });

    it("should deny runner from editing workflows", () => {
      expect(hasPermission('runner', 'workflow:edit')).toBe(false);
      expect(hasPermission('runner', 'workflow:create')).toBe(false);
    });

    it("should allow viewer only view permissions", () => {
      expect(hasPermission('viewer', 'workflow:view')).toBe(true);
      expect(hasPermission('viewer', 'template:view')).toBe(true);
      expect(hasPermission('viewer', 'run:view')).toBe(true);
    });

    it("should deny viewer from any edit/create/delete operations", () => {
      expect(hasPermission('viewer', 'workflow:create')).toBe(false);
      expect(hasPermission('viewer', 'workflow:edit')).toBe(false);
      expect(hasPermission('viewer', 'workflow:delete')).toBe(false);
      expect(hasPermission('viewer', 'workflow:run')).toBe(false);
    });

    it("should allow builder to manage secrets", () => {
      expect(hasPermission('builder', 'secret:create')).toBe(true);
      expect(hasPermission('builder', 'secret:edit')).toBe(true);
      expect(hasPermission('builder', 'secret:view')).toBe(true);
    });

    it("should deny builder from deleting secrets", () => {
      expect(hasPermission('builder', 'secret:delete')).toBe(false);
    });
  });

  describe("requirePermission()", () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let statusSpy: ReturnType<typeof vi.fn>;
    let jsonSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      statusSpy = vi.fn().mockReturnThis();
      jsonSpy = vi.fn();

      mockReq = {
        path: '/api/workflows',
      };

      mockRes = {
        status: statusSpy,
        json: jsonSpy as any,
      };

      mockNext = vi.fn();
    });

    it("should return 401 if user is not authenticated", () => {
      const middleware = requirePermission('workflow:create');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        message: 'Authentication required',
        error: 'unauthorized',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 403 if user lacks required permission", () => {
      mockReq.userId = 'user-123';
      mockReq.userRole = 'viewer';

      const middleware = requirePermission('workflow:create');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        message: 'Permission denied',
        error: 'forbidden',
        details: 'Required permission: workflow:create',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should call next() if user has required permission", () => {
      mockReq.userId = 'user-123';
      mockReq.userRole = 'builder';

      const middleware = requirePermission('workflow:create');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it("should allow owner to access any permission", () => {
      mockReq.userId = 'owner-123';
      mockReq.userRole = 'owner';

      const middleware = requirePermission('workflow:delete');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it("should return 403 for null userRole", () => {
      mockReq.userId = 'user-123';
      mockReq.userRole = null;

      const middleware = requirePermission('workflow:view');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        message: 'Permission denied',
        error: 'forbidden',
        details: 'Required permission: workflow:view',
      });
    });
  });

  describe("requireAnyPermission()", () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let statusSpy: ReturnType<typeof vi.fn>;
    let jsonSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      statusSpy = vi.fn().mockReturnThis();
      jsonSpy = vi.fn();

      mockReq = {
        path: '/api/workflows',
        userId: 'user-123',
      };

      mockRes = {
        status: statusSpy,
        json: jsonSpy as any,
      };

      mockNext = vi.fn();
    });

    it("should allow if user has at least one permission", () => {
      mockReq.userRole = 'builder';

      const middleware = requireAnyPermission('workflow:create', 'workflow:edit', 'workflow:delete');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should deny if user has none of the permissions", () => {
      mockReq.userRole = 'viewer';

      const middleware = requireAnyPermission('workflow:create', 'workflow:edit', 'workflow:delete');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        message: 'Permission denied',
        error: 'forbidden',
        details: 'Required permissions (any): workflow:create, workflow:edit, workflow:delete',
      });
    });

    it("should allow owner with wildcard permission", () => {
      mockReq.userRole = 'owner';

      const middleware = requireAnyPermission('workflow:delete', 'team:delete');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("requireAllPermissions()", () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let statusSpy: ReturnType<typeof vi.fn>;
    let jsonSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      statusSpy = vi.fn().mockReturnThis();
      jsonSpy = vi.fn();

      mockReq = {
        path: '/api/workflows',
        userId: 'user-123',
      };

      mockRes = {
        status: statusSpy,
        json: jsonSpy as any,
      };

      mockNext = vi.fn();
    });

    it("should allow if user has all required permissions", () => {
      mockReq.userRole = 'builder';

      const middleware = requireAllPermissions('workflow:view', 'workflow:edit');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should deny if user is missing any permission", () => {
      mockReq.userRole = 'builder';

      const middleware = requireAllPermissions('workflow:edit', 'workflow:delete');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        message: 'Permission denied',
        error: 'forbidden',
        details: 'Required permissions (all): workflow:edit, workflow:delete',
      });
    });

    it("should allow owner with wildcard permission", () => {
      mockReq.userRole = 'owner';

      const middleware = requireAllPermissions('workflow:delete', 'team:delete', 'tenant:manage-users');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("requireRole()", () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let statusSpy: ReturnType<typeof vi.fn>;
    let jsonSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      statusSpy = vi.fn().mockReturnThis();
      jsonSpy = vi.fn();

      mockReq = {
        path: '/api/admin',
        userId: 'user-123',
      };

      mockRes = {
        status: statusSpy,
        json: jsonSpy as any,
      };

      mockNext = vi.fn();
    });

    it("should allow if user has required role", () => {
      mockReq.userRole = 'owner';

      const middleware = requireRole('owner');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should allow if user has one of multiple allowed roles", () => {
      mockReq.userRole = 'builder';

      const middleware = requireRole('owner', 'builder');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should deny if user lacks required role", () => {
      mockReq.userRole = 'viewer';

      const middleware = requireRole('owner', 'builder');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        message: 'Access denied',
        error: 'forbidden',
        details: 'Required role: owner or builder',
      });
    });

    it("should deny if userRole is null", () => {
      mockReq.userRole = null;

      const middleware = requireRole('owner');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(403);
    });
  });

  describe("Role Shortcuts", () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn() as any,
      };

      mockNext = vi.fn();

      mockReq = {
        path: '/api/test',
        userId: 'user-123',
      };
    });

    describe("requireOwner", () => {
      it("should allow only owner role", () => {
        mockReq.userRole = 'owner';
        requireOwner(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalled();
      });

      it("should deny builder role", () => {
        mockReq.userRole = 'builder';
        requireOwner(mockReq as Request, mockRes as Response, mockNext);
        expect(mockRes.status).toHaveBeenCalledWith(403);
      });
    });

    describe("requireBuilder", () => {
      it("should allow owner", () => {
        mockReq.userRole = 'owner';
        requireBuilder(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalled();
      });

      it("should allow builder", () => {
        mockReq.userRole = 'builder';
        requireBuilder(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalled();
      });

      it("should deny runner", () => {
        mockReq.userRole = 'runner';
        requireBuilder(mockReq as Request, mockRes as Response, mockNext);
        expect(mockRes.status).toHaveBeenCalledWith(403);
      });
    });

    describe("requireRunner", () => {
      it("should allow owner", () => {
        mockReq.userRole = 'owner';
        requireRunner(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalled();
      });

      it("should allow builder", () => {
        mockReq.userRole = 'builder';
        requireRunner(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalled();
      });

      it("should allow runner", () => {
        mockReq.userRole = 'runner';
        requireRunner(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalled();
      });

      it("should deny viewer", () => {
        mockReq.userRole = 'viewer';
        requireRunner(mockReq as Request, mockRes as Response, mockNext);
        expect(mockRes.status).toHaveBeenCalledWith(403);
      });
    });
  });

  describe("getUserPermissions()", () => {
    it("should return empty array for unauthenticated request", () => {
      const mockReq = {} as Request;
      expect(getUserPermissions(mockReq)).toEqual([]);
    });

    it("should return empty array for null userRole", () => {
      const mockReq = {
        userId: 'user-123',
        userRole: null,
      } as AuthRequest;

      expect(getUserPermissions(mockReq)).toEqual([]);
    });

    it("should return all permissions for owner", () => {
      const mockReq = {
        userId: 'owner-123',
        userRole: 'owner',
      } as AuthRequest;

      const permissions = getUserPermissions(mockReq);
      expect(permissions).toContain('*');
    });

    it("should return builder permissions", () => {
      const mockReq = {
        userId: 'builder-123',
        userRole: 'builder',
      } as AuthRequest;

      const permissions = getUserPermissions(mockReq);
      expect(permissions).toContain('workflow:create');
      expect(permissions).toContain('workflow:edit');
      expect(permissions).toContain('secret:create');
      expect(permissions).not.toContain('workflow:delete');
    });

    it("should return runner permissions", () => {
      const mockReq = {
        userId: 'runner-123',
        userRole: 'runner',
      } as AuthRequest;

      const permissions = getUserPermissions(mockReq);
      expect(permissions).toContain('workflow:view');
      expect(permissions).toContain('workflow:run');
      expect(permissions).not.toContain('workflow:create');
      expect(permissions).not.toContain('workflow:edit');
    });

    it("should return viewer permissions", () => {
      const mockReq = {
        userId: 'viewer-123',
        userRole: 'viewer',
      } as AuthRequest;

      const permissions = getUserPermissions(mockReq);
      expect(permissions).toContain('workflow:view');
      expect(permissions).toContain('template:view');
      expect(permissions).not.toContain('workflow:run');
      expect(permissions).not.toContain('workflow:create');
    });
  });

  describe("Edge Cases", () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn() as any,
      };

      mockNext = vi.fn();

      mockReq = {
        path: '/api/test',
      };
    });

    it("should handle missing userId gracefully", () => {
      const middleware = requirePermission('workflow:view');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it("should handle undefined userRole gracefully", () => {
      mockReq.userId = 'user-123';
      mockReq.userRole = undefined;

      const middleware = requirePermission('workflow:view');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it("should handle invalid role type gracefully", () => {
      mockReq.userId = 'user-123';
      mockReq.userRole = 'invalid-role' as UserRole;

      const middleware = requirePermission('workflow:view');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });
});
