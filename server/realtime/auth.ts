import { IncomingMessage } from 'http';

import { WebSocket } from 'ws';

import { createLogger } from '../logger';
import { authService, type JWTPayload } from '../services/AuthService';
import { workflowService } from '../services/WorkflowService';
import { runWithTenantContext } from '../utils/rlsContext';
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
  const url = new URL(request.url ?? '', `http://${request.headers.host}`);
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
  const result: { tenantId: string; workflowId: string; versionId?: string } = {
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
  // Validate workflow access. Collaboration is gated on the same ACL check
  // the rest of the app uses to authorize editing a workflow
  // (`WorkflowService.verifyAccess`), rather than a second, narrower
  // "are you the creator" rule — a user granted edit access via
  // `workflow_access` must be able to join too, and the creator keeps
  // working because ownership already satisfies 'edit' in that check.
  // Collaborative editing implies edit rights, so view-only access is still
  // rejected here (MAP-B5).
  try {
    // RLS-2e: this WebSocket upgrade path never runs through Express's
    // `rlsContext` middleware (it isn't an HTTP request), so
    // `WorkflowService.verifyAccess` — now RLS-2e-converted and requiring an
    // ambient tenant — would otherwise throw "no tenant in context" for
    // every collab connection. `payload.tenantId` is already verified from
    // the JWT and checked against the room's tenant above, so it is exactly
    // the tenant this operation should run as; open that context explicitly
    // for the one call that needs it, mirroring how a background job wraps
    // a converted service call in `runWithTenantContext` (§2c).
    await runWithTenantContext(payload.tenantId, () =>
      workflowService.verifyAccess(roomInfo.workflowId, payload.userId, 'edit')
    );
  } catch (error) {
    logger.warn(
      {
        workflowId: roomInfo.workflowId,
        userId: payload.userId,
        error: error instanceof Error ? error.message : error,
      },
      'Access denied: user lacks edit access to this workflow'
    );
    throw error instanceof Error ? error : new Error('Access denied');
  }
  // Validate RBAC permissions.
  //
  // DEBT-3b: this read `payload.role`, which is the *system* role
  // (admin/creator, set to 'creator' for every registration in
  // auth.routes.ts) -- not the tenant role. Since 'creator' is not in
  // allowedRoles, every registered user was rejected with 'Invalid user role'
  // and real-time collaboration could not connect at all. `canMutate()` below
  // and `AuthenticatedUser.role` are both defined in tenant-role terms, so
  // `tenantRole` is the claim this check always meant.
  const role = payload.tenantRole ?? 'viewer';
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
    // No cast needed: payload.tenantRole is already this exact union, which is
    // itself a sign this is the claim the check always meant to read.
    role,
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
export function canView(_user: AuthenticatedUser): boolean {
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
  // eslint-disable-next-line sonarjs/no-all-duplicated-branches
  const code = error.message.includes('tenant') ? 1008 : 1008; // Policy Violation
  ws.close(code, error.message);
}