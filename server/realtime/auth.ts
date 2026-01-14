import { IncomingMessage } from 'http';

import { eq, and } from 'drizzle-orm';
import { WebSocket } from 'ws';

import { workflows } from '../../shared/schema';
import { db } from '../db';
import { createLogger } from '../logger';
import { authService, type JWTPayload } from '../services/AuthService';

const logger = createLogger({ module: 'collab-auth' });

export interface AuthenticatedUser {
  userId: string;
  email: string;
  tenantId: string;
  role: 'owner' | 'builder' | 'runner' | 'viewer';
  displayName: string;
  color: string; // For presence
}

/**
 * Extract JWT token from WebSocket upgrade request
 */
function extractToken(request: IncomingMessage): string | null {
  // Try Authorization header
  const authHeader = request.headers['authorization'];
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return authHeader;
  }

  // Try query parameter (fallback for clients that can't set headers)
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  const token = url.searchParams.get('token');
  if (token) {
    return token;
  }

  return null;
}

/**
 * Parse room key to extract tenant, workflow, and version info
 */
function parseRoomKey(roomKey: string): {
  tenantId: string;
  workflowId: string;
  versionId?: string;
} | null {
  // Format: tenant:{tenantId}:workflow:{workflowId}[:version:{versionId}]
  const parts = roomKey.split(':');

  if (parts.length < 4 || parts[0] !== 'tenant' || parts[2] !== 'workflow') {
    return null;
  }

  const result: any = {
    tenantId: parts[1],
    workflowId: parts[3],
  };

  if (parts.length >= 6 && parts[4] === 'version') {
    result.versionId = parts[5];
  }

  return result;
}

/**
 * Generate a random color for user presence
 */
function generateColor(userId: string): string {
  const colors = [
    '#ef4444', // red
    '#f59e0b', // amber
    '#10b981', // emerald
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
  ];

  // Use userId to deterministically pick a color
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

/**
 * Authenticate WebSocket connection and validate permissions
 */
export async function authenticateConnection(
  request: IncomingMessage,
  roomKey: string
): Promise<AuthenticatedUser> {
  logger.debug({ roomKey }, 'authenticateConnection started');
  // Extract JWT token
  const token = extractToken(request);
  if (!token) {
    logger.warn({ roomKey }, 'No token found in request');
    throw new Error('Missing authentication token');
  }

  // Verify JWT
  let payload: JWTPayload;
  try {
    payload = authService.verifyToken(token);
  } catch (error) {
    logger.warn({ error }, 'Invalid JWT token');
    throw new Error('Invalid authentication token');
  }

  // Parse room key
  const roomInfo = parseRoomKey(roomKey);
  if (!roomInfo) {
    throw new Error('Invalid room key format');
  }

  // Validate tenant match
  if (payload.tenantId !== roomInfo.tenantId) {
    logger.warn(
      {
        userTenantId: payload.tenantId,
        roomTenantId: roomInfo.tenantId,
        userId: payload.userId,
      },
      'Cross-tenant access attempt'
    );
    throw new Error('Access denied: tenant mismatch');
  }

  // Validate workflow access
  // We simply look up the workflow by ID, then verify ownership/tenancy.
  // The previous check assumed projectId === tenantId, which is incorrect for unfiled workflows or normal usage.
  const workflow = await db.query.workflows.findFirst({
    where: eq(workflows.id, roomInfo.workflowId),
    with: {
      project: true, // Fetch full project to check tenancy if needed
    },
  });

  if (!workflow) {
    logger.warn(
      {
        workflowId: roomInfo.workflowId,
        tenantId: roomInfo.tenantId,
        userId: payload.userId,
      },
      'Workflow not found in database'
    );
    throw new Error('Workflow not found');
  }

  // Security Check: Ensure user has access to this workflow
  // 1. Is the user the creator?
  const isCreator = workflow.creatorId === payload.userId;

  // 2. Is the workflow in the user's tenant? (If projects have tenantId)
  // Note: we'd need to check workflow.project?.tenantId === payload.tenantId
  // For now, we rely on creator check for the owner.

  if (!isCreator) {
    logger.warn(
      {
        workflowId: roomInfo.workflowId,
        userId: payload.userId,
        creatorId: workflow.creatorId,
      },
      'Access denied: User is not the creator'
    );
    // Temporarily allow if we can't verify tenant logic yet, OR block.
    // Given the user is the 'owner' in the logs, isCreator should be true.
    throw new Error('Access denied');
  }

  // Validate RBAC permissions
  const role = payload.role || 'viewer';
  const allowedRoles = ['owner', 'builder', 'runner', 'viewer'];

  if (!allowedRoles.includes(role)) {
    throw new Error('Invalid user role');
  }

  // Create display name from email
  const displayName = payload.email.split('@')[0];
  const color = generateColor(payload.userId);

  logger.info(
    {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role,
      workflowId: roomInfo.workflowId,
    },
    'User authenticated for collaboration'
  );

  return {
    userId: payload.userId,
    email: payload.email,
    tenantId: payload.tenantId,
    role: role as any,
    displayName,
    color,
  };
}

/**
 * Check if user has permission to mutate the document
 */
export function canMutate(user: AuthenticatedUser): boolean {
  return user.role === 'owner' || user.role === 'builder';
}

/**
 * Check if user has permission to view the document
 */
export function canView(user: AuthenticatedUser): boolean {
  return true; // All authenticated users can view
}

/**
 * Handle authentication error by closing WebSocket with appropriate code
 */
export function handleAuthError(ws: WebSocket, error: Error): void {
  logger.warn({ error: error.message }, 'Authentication failed');

  // Send error message before closing
  try {
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message,
    }));
  } catch (sendError) {
    // Ignore send errors
  }

  // Close with appropriate code
  const code = error.message.includes('tenant') ? 1008 : 1008; // Policy Violation
  ws.close(code, error.message);
}
