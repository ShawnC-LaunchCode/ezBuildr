import { Awareness } from 'y-protocols/awareness';
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
  selectedNodeId?: string | null;
  lastActive: number;
}

/**
 * Initialize awareness for a Yjs document
 */
export function createAwareness(doc: Y.Doc): Awareness {
  const awareness = new Awareness(doc);

  // Log awareness changes for debugging
  awareness.on('change', (changes: any) => {
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
  const currentState = awareness.getLocalState();
  if (currentState?.user) {
    const updatedState = {
      ...currentState.user,
      cursor: { x, y },
      lastActive: Date.now(),
    };
    awareness.setLocalStateField('user', updatedState);
  }
}

/**
 * Update selected node
 */
export function updateSelectedNode(
  awareness: Awareness,
  clientId: number,
  nodeId: string | null
): void {
  const currentState = awareness.getLocalState();
  if (currentState?.user) {
    const updatedState = {
      ...currentState.user,
      selectedNodeId: nodeId,
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
    if (state.user) {
      users.push(state.user);
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
  thresholdMs: number = 30000
): boolean {
  return Date.now() - presenceState.lastActive < thresholdMs;
}

/**
 * Cleanup inactive users (called periodically)
 */
export function cleanupInactiveUsers(
  awareness: Awareness,
  thresholdMs: number = 60000
): void {
  const states = awareness.getStates();
  const now = Date.now();

  states.forEach((state, clientId) => {
    if (state.user && !isUserActive(state.user, thresholdMs)) {
      logger.debug(
        {
          clientId,
          userId: state.user.userId,
          lastActive: state.user.lastActive,
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
  const { encodeAwarenessUpdate } = require('y-protocols/awareness');
  return encodeAwarenessUpdate(awareness, clients);
}

/**
 * Apply awareness update from remote
 */
export function applyAwarenessUpdate(
  awareness: Awareness,
  update: Uint8Array,
  origin?: any
): void {
  const { applyAwarenessUpdate } = require('y-protocols/awareness');
  applyAwarenessUpdate(awareness, update, origin);
}
