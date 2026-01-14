import { IncomingMessage, Server as HTTPServer } from 'http';

import { encoding, decoding } from 'lib0';
import { WebSocket, WebSocketServer } from 'ws';
import { Awareness } from 'y-protocols/awareness';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

import { createLogger } from '../logger';

import {
  authenticateConnection,
  canMutate,
  handleAuthError,
  type AuthenticatedUser,
} from './auth';
import {
  createAwareness,
  setUserPresence,
  removeUserPresence,
  cleanupInactiveUsers,
  getActiveUserCount,
} from './awareness';
import {
  getOrCreateCollabDoc,
  loadDocument,
  saveUpdate,
  publishUpdate,
  subscribeToRoom,
  initRedis,
  cleanup as cleanupPersistence,
} from './persistence';

const logger = createLogger({ module: 'collab-server' });

// Message types for y-websocket protocol
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

interface Room {
  name: string;
  doc: Y.Doc;
  awareness: Awareness;
  connections: Set<CollabConnection>;
  unsubscribeRedis?: () => void;
}

interface CollabConnection {
  ws: WebSocket;
  user: AuthenticatedUser;
  roomName: string;
  alive: boolean;
  clientId: number;
}

// Global state
const rooms = new Map<string, Room>();
const connections = new Map<WebSocket, CollabConnection>();
let wss: WebSocketServer | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;

// Metrics
const metrics = {
  activeRooms: 0,
  activeConnections: 0,
  totalMessages: 0,
  totalUpdates: 0,
};

/**
 * Initialize WebSocket collaboration server
 */
/**
 * Initialize WebSocket collaboration server
 */
export function initCollabServer(server: HTTPServer): void {
  logger.info('Initializing WebSocket collaboration server');

  // Initialize Redis for multi-instance support
  initRedis();

  // Attach to existing HTTP server
  // This allows sharing the single exposed port on Railway/PaaS
  wss = new WebSocketServer({
    server,
    clientTracking: true,
    path: '/collab'
  });

  logger.info('WebSocket collaboration server attached to main HTTP server path /collab');

  wss.on('connection', handleConnection);

  wss.on('error', (err) => {
    logger.error({ err }, 'WebSocket Server Error');
  });

  // Start cleanup interval for inactive users
  cleanupInterval = setInterval(() => {
    rooms.forEach((room) => {
      cleanupInactiveUsers(room.awareness);
    });
  }, 30000); // Every 30 seconds

  // Start heartbeat interval
  setInterval(() => {
    connections.forEach((conn, ws) => {
      if (!conn.alive) {
        logger.debug({ userId: conn.user.userId }, 'Terminating inactive connection');
        ws.terminate();
        return;
      }

      conn.alive = false;
      ws.ping();
    });
  }, 30000); // Every 30 seconds

  logger.info('WebSocket collaboration server initialized');
}

/**
 * Handle new WebSocket connection
 */
async function handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
  logger.debug('New WebSocket connection attempt');

  // Extract room name from URL
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  const roomName = url.searchParams.get('room');

  if (!roomName) {
    ws.close(1008, 'Missing room parameter');
    return;
  }

  try {
    // Authenticate connection
    const user = await authenticateConnection(request, roomName);

    // Get or create room
    const room = await getOrCreateRoom(roomName, user.tenantId);

    // Create connection object
    const clientId = generateClientId();
    const connection: CollabConnection = {
      ws,
      user,
      roomName,
      alive: true,
      clientId,
    };

    // Add connection to room and global map
    room.connections.add(connection);
    connections.set(ws, connection);

    // Set user presence
    setUserPresence(room.awareness, clientId, user);

    // Update metrics
    metrics.activeConnections = connections.size;

    logger.info(
      {
        userId: user.userId,
        roomName,
        activeUsers: room.connections.size,
      },
      'User joined collaboration room'
    );

    // Setup WebSocket handlers
    setupWebSocketHandlers(ws, connection, room);

    // Send initial sync
    sendInitialSync(ws, room);

  } catch (error) {
    handleAuthError(ws, error as Error);
  }
}

/**
 * Setup WebSocket event handlers
 */
function setupWebSocketHandlers(
  ws: WebSocket,
  connection: CollabConnection,
  room: Room
): void {
  // Handle incoming messages
  ws.on('message', async (data: Buffer) => {
    try {
      await handleMessage(connection, room, new Uint8Array(data));
    } catch (error) {
      logger.error({ error, userId: connection.user.userId }, 'Error handling message');
    }
  });

  // Handle pong (heartbeat response)
  ws.on('pong', () => {
    connection.alive = true;
  });

  // Handle connection close
  ws.on('close', (code, reason) => {
    handleDisconnection(connection, room);
  });

  // Handle errors
  ws.on('error', (error) => {
    logger.error({ error, userId: connection.user.userId }, 'WebSocket error');
  });
}

/**
 * Handle incoming message
 */
async function handleMessage(
  connection: CollabConnection,
  room: Room,
  message: Uint8Array
): Promise<void> {
  metrics.totalMessages++;

  try {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC:
        await handleSyncMessage(connection, room, decoder);
        break;

      case MESSAGE_AWARENESS:
        handleAwarenessMessage(connection, room, decoder);
        break;

      default:
        logger.warn({ messageType }, 'Unknown message type');
    }
  } catch (error: any) {
    logger.error({ error, userId: connection.user.userId, roomName: room.name }, 'Failed to decode message');
  }
}

/**
 * Handle sync protocol message
 */
async function handleSyncMessage(
  connection: CollabConnection,
  room: Room,
  decoder: decoding.Decoder
): Promise<void> {
  // Use a fresh encoder to capture any response (e.g. Sync Step 2)
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);

  // readSyncMessage will:
  // 1. Read the message type.
  // 2. If Step 1: Write Sync Step 2 to the encoder.
  // 3. If Step 2 or Update: Read the update and apply it to room.doc using 'connection' as origin.
  //    This triggers doc.on('update'), where we handle persistence and broadcasting.
  syncProtocol.readSyncMessage(decoder, encoder, room.doc, connection);

  // If the protocol generated a response (e.g. Step 2), send it back
  if (encoding.length(encoder) > 1) { // > 1 because we wrote message type
    connection.ws.send(encoding.toUint8Array(encoder));
  }
}

/**
 * Handle awareness protocol message
 */
function handleAwarenessMessage(
  connection: CollabConnection,
  room: Room,
  decoder: decoding.Decoder
): void {
  const update = decoding.readVarUint8Array(decoder);

  // Apply awareness update
  awarenessProtocol.applyAwarenessUpdate(room.awareness, update, connection);

  // Broadcast to other connections
  broadcastAwarenessUpdate(room, update, connection.ws);
}

/**
 * Send initial sync to newly connected client
 */
function sendInitialSync(ws: WebSocket, room: Room): void {
  // Send sync step 1 (document state)
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, room.doc);
  ws.send(encoding.toUint8Array(encoder));

  // Send awareness state
  const awarenessEncoder = encoding.createEncoder();
  encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    awarenessEncoder,
    awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(room.awareness.getStates().keys()))
  );
  ws.send(encoding.toUint8Array(awarenessEncoder));

  logger.debug({ activeUsers: room.connections.size }, 'Sent initial sync');
}

/**
 * Broadcast update to all connections except sender
 */
function broadcastUpdate(room: Room, update: Uint8Array, senderWs: WebSocket): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);

  room.connections.forEach((conn) => {
    if (conn.ws !== senderWs && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(message);
    }
  });
}

/**
 * Broadcast awareness update to all connections except sender
 */
function broadcastAwarenessUpdate(
  room: Room,
  update: Uint8Array,
  senderWs: WebSocket
): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(encoder, update);
  const message = encoding.toUint8Array(encoder);

  room.connections.forEach((conn) => {
    if (conn.ws !== senderWs && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(message);
    }
  });
}

/**
 * Handle disconnection
 */
function handleDisconnection(connection: CollabConnection, room: Room): void {
  logger.info(
    {
      userId: connection.user.userId,
      roomName: room.name,
    },
    'User disconnected from collaboration room'
  );

  // Remove connection from room
  room.connections.delete(connection);
  connections.delete(connection.ws);

  // Remove user presence
  removeUserPresence(room.awareness, connection.clientId);

  // Update metrics
  metrics.activeConnections = connections.size;

  // If room is empty, clean it up after a delay
  if (room.connections.size === 0) {
    setTimeout(() => {
      if (room.connections.size === 0) {
        cleanupRoom(room.name);
      }
    }, 60000); // 1 minute delay
  }
}

/**
 * Get or create a room
 */
async function getOrCreateRoom(roomName: string, tenantId: string): Promise<Room> {
  let room = rooms.get(roomName);

  if (room) {
    return room;
  }

  logger.info({ roomName }, 'Creating new collaboration room');

  // Parse room name to get workflow ID
  const roomInfo = parseRoomKey(roomName);
  if (!roomInfo) {
    throw new Error('Invalid room key format');
  }

  // Get or create collab doc
  const docId = await getOrCreateCollabDoc(
    roomInfo.workflowId,
    tenantId,
    roomInfo.versionId
  );

  // Load document from database
  const doc = await loadDocument(docId);

  // Create awareness
  const awareness = createAwareness(doc);

  // Subscribe to Redis for multi-instance sync
  const unsubscribeRedis = subscribeToRoom(roomName, (update) => {
    Y.applyUpdate(doc, update, 'remote');
  });

  // Handle document updates (from clients or remote)
  doc.on('update', async (update: Uint8Array, origin: any) => {
    // 1. Update from Remote (Redis) -> Broadcast to local clients
    if (origin === 'remote') {
      broadcastUpdate(room!, update, null as any);
      return;
    }

    // 2. Update from Client Connection -> Persist & Broadcast
    if (origin && typeof origin === 'object' && origin.user) {
      const connection = origin as CollabConnection;

      // Check permissions (Soft enforcement: prevents propagation)
      if (!canMutate(connection.user)) {
        logger.warn({ userId: connection.user.userId }, 'User attempted to mutate without permission');
        return;
      }

      metrics.totalUpdates++;

      // Persist to DB & Publish to Redis
      try {
        const docId = await getDocIdForRoom(roomName, connection.user.tenantId);
        await saveUpdate(docId, update);
        await publishUpdate(roomName, update);
      } catch (error) {
        logger.error({ error }, 'Failed to persist update');
      }

      // Broadcast to other clients in the room
      broadcastUpdate(room!, update, connection.ws);
    }
  });

  // Create room
  room = {
    name: roomName,
    doc,
    awareness,
    connections: new Set(),
    unsubscribeRedis,
  };

  rooms.set(roomName, room);
  metrics.activeRooms = rooms.size;

  logger.info({ roomName, docId }, 'Collaboration room created');

  return room;
}

/**
 * Cleanup room when all users disconnect
 */
function cleanupRoom(roomName: string): void {
  const room = rooms.get(roomName);
  if (!room) {return;}

  logger.info({ roomName }, 'Cleaning up collaboration room');

  // Unsubscribe from Redis
  if (room.unsubscribeRedis) {
    room.unsubscribeRedis();
  }

  // Destroy awareness
  room.awareness.destroy();

  // Remove room
  rooms.delete(roomName);
  metrics.activeRooms = rooms.size;
}

/**
 * Parse room key (same as in auth.ts)
 */
function parseRoomKey(roomKey: string): {
  tenantId: string;
  workflowId: string;
  versionId?: string;
} | null {
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
 * Get docId for a room (cached or fetch)
 */
async function getDocIdForRoom(roomName: string, tenantId: string): Promise<string> {
  const roomInfo = parseRoomKey(roomName);
  if (!roomInfo) {
    throw new Error('Invalid room key');
  }

  return getOrCreateCollabDoc(
    roomInfo.workflowId,
    tenantId,
    roomInfo.versionId
  );
}

/**
 * Generate unique client ID
 */
let clientIdCounter = 0;
function generateClientId(): number {
  return ++clientIdCounter;
}

/**
 * Get collaboration metrics
 */
export function getMetrics(): typeof metrics & { roomDetails: any[] } {
  const roomDetails = Array.from(rooms.entries()).map(([name, room]) => ({
    name,
    activeUsers: room.connections.size,
    documentSize: Y.encodeStateAsUpdate(room.doc).length,
  }));

  return {
    ...metrics,
    roomDetails,
  };
}

/**
 * Get room statistics (for debug endpoint)
 */
export function getRoomStats(roomName: string): any {
  const room = rooms.get(roomName);
  if (!room) {
    return null;
  }

  return {
    name: room.name,
    activeUsers: room.connections.size,
    users: Array.from(room.connections).map((conn) => ({
      userId: conn.user.userId,
      displayName: conn.user.displayName,
      role: conn.user.role,
    })),
    documentSize: Y.encodeStateAsUpdate(room.doc).length,
    awarenessStates: room.awareness.getStates().size,
  };
}

/**
 * Cleanup and shutdown collaboration server
 */
export async function shutdown(): Promise<void> {
  logger.info('Shutting down collaboration server');

  // Clear intervals
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  // Close all WebSocket connections
  connections.forEach((conn) => {
    conn.ws.close(1001, 'Server shutting down');
  });

  // Cleanup all rooms
  rooms.forEach((room, name) => {
    cleanupRoom(name);
  });

  // Cleanup persistence
  await cleanupPersistence();

  // Close WebSocket server
  if (wss) {
    wss.close();
  }

  logger.info('Collaboration server shutdown complete');
}
