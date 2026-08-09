import {
  Awareness,
  applyAwarenessUpdate as applyProtocolAwarenessUpdate,
  encodeAwarenessUpdate as encodeProtocolAwarenessUpdate,
} from 'y-protocols/awareness';
import * as Y from 'yjs';

import { createLogger } from '../logger';

import { AuthenticatedUser } from './auth';

const logger = createLogger({ module: 'collab-awareness' });

export interface PresenceState {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  color: string;
  cursor?: {
    x: number;
    y: number;
  };
  lastActive: number;
}

function isPresenceState(value: unknown): value is PresenceState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const state = value as Record<string, unknown>;
  return typeof state.userId === 'string'
    && typeof state.displayName === 'string'
    && typeof state.email === 'string'
    && typeof state.role === 'string'
    && typeof state.color === 'string'
    && typeof state.lastActive === 'number';
}

/**
 * Initialize awareness for a Yjs document
 */
export function createAwareness(doc: Y.Doc): Awareness {
  const awareness = new Awareness(doc);

  // Log awareness changes for debugging
  awareness.on('change', (changes: { added: Iterable<unknown>; updated: Iterable<unknown>; removed: Iterable<unknown> }) => {
    const added = Array.from(changes.added);
    const updated = Array.from(changes.updated);
    const removed = Array.from(changes.removed);

    if (added.length > 0) {
      logger.debug({ added }, 'Awareness: users joined');
    }
    if (updated.length > 0) {
      logger.debug({ updated }, 'Awareness: users updated');
    }
    if (removed.length > 0) {
      logger.debug({ removed }, 'Awareness: users left');
    }
  });

  return awareness;
}

/**
 * Set user presence state in awareness
 */
export function setUserPresence(
  awareness: Awareness,
  clientId: number,
  user: AuthenticatedUser
): void {
  const presenceState: PresenceState = {
    userId: user.userId,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    color: user.color,
    lastActive: Date.now(),
  };

  awareness.setLocalStateField('user', presenceState);

  logger.debug(
    {
      clientId,
      userId: user.userId,
      displayName: user.displayName,
    },
    'User presence set'
  );
}

/**
 * Update user cursor position
 */
export function updateCursor(
  awareness: Awareness,
  clientId: number,
  x: number,
  y: number
): void {
  const currentUser: unknown = awareness.getLocalState()?.user;
  if (isPresenceState(currentUser)) {
    const updatedState: PresenceState = {
      ...currentUser,
      cursor: { x, y },
      lastActive: Date.now(),
    };
    awareness.setLocalStateField('user', updatedState);
  }
}

/**
 * Remove user presence when they disconnect
 */
export function removeUserPresence(
  awareness: Awareness,
  clientId: number
): void {
  awareness.setLocalState(null);

  logger.debug({ clientId }, 'User presence removed');
}

/**
 * Get all active users
 */
export function getActiveUsers(awareness: Awareness): PresenceState[] {
  const states = awareness.getStates();
  const users: PresenceState[] = [];

  states.forEach((state) => {
    const user: unknown = state.user;
    if (isPresenceState(user)) {
      users.push(user);
    }
  });

  return users;
}

/**
 * Get count of active users
 */
export function getActiveUserCount(awareness: Awareness): number {
  return getActiveUsers(awareness).length;
}

/**
 * Check if user is active (last active within threshold)
 */
export function isUserActive(
  presenceState: PresenceState,
  thresholdMs = 30000
): boolean {
  return Date.now() - presenceState.lastActive < thresholdMs;
}

/**
 * Cleanup inactive users (called periodically)
 */
export function cleanupInactiveUsers(
  awareness: Awareness,
  thresholdMs = 60000
): void {
  const states = awareness.getStates();
  const _now = Date.now();

  states.forEach((state, clientId) => {
    const user: unknown = state.user;
    if (isPresenceState(user) && !isUserActive(user, thresholdMs)) {
      logger.debug(
        {
          clientId,
          userId: user.userId,
          lastActive: user.lastActive,
        },
        'Removing inactive user'
      );
      awareness.setLocalState(null);
    }
  });
}

/**
 * Encode awareness update for transmission
 */
export function encodeAwarenessUpdate(
  awareness: Awareness,
  clients?: number[]
): Uint8Array {
  const clientIds = clients ?? Array.from(awareness.getStates().keys());
  return encodeProtocolAwarenessUpdate(awareness, clientIds);
}

/**
 * Apply awareness update from remote
 */
export function applyAwarenessUpdate(
  awareness: Awareness,
  update: Uint8Array,
  origin?: unknown
): void {
  applyProtocolAwarenessUpdate(awareness, update, origin);
}
