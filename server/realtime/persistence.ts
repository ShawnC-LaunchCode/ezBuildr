import * as Y from 'yjs';
import { db } from '../db';
import { collabDocs, collabUpdates, collabSnapshots } from '../../shared/schema';
import { eq, desc, and, gt } from 'drizzle-orm';
import { createLogger } from '../logger';
import Redis from 'ioredis';

const logger = createLogger({ module: 'collab-persistence' });

// Redis client for pub/sub
let redisPublisher: Redis | null = null;
let redisSubscriber: Redis | null = null;

const REDIS_URL = process.env.REDIS_URL;
const SNAPSHOT_INTERVAL = parseInt(process.env.COLLAB_SNAPSHOT_INTERVAL || '200', 10); // Every N updates
const UPDATES_TO_KEEP = parseInt(process.env.COLLAB_UPDATES_TO_KEEP || '1000', 10); // Keep last N updates

/**
 * Initialize Redis pub/sub for multi-instance collaboration
 */
export function initRedis() {
  if (!REDIS_URL) {
    logger.warn('REDIS_URL not configured, multi-instance collab will not work');
    return;
  }

  try {
    redisPublisher = new Redis(REDIS_URL);
    redisSubscriber = new Redis(REDIS_URL);

    redisPublisher.on('error', (err) => {
      logger.error({ error: err }, 'Redis publisher error');
    });

    redisSubscriber.on('error', (err) => {
      logger.error({ error: err }, 'Redis subscriber error');
    });

    logger.info('Redis pub/sub initialized for multi-instance collaboration');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Redis');
  }
}

/**
 * Publish update to Redis channel for other instances
 */
export async function publishUpdate(roomKey: string, update: Uint8Array): Promise<void> {
  if (!redisPublisher) return;

  try {
    const base64Update = Buffer.from(update).toString('base64');
    await redisPublisher.publish(`room:${roomKey}`, base64Update);
  } catch (error) {
    logger.error({ error, roomKey }, 'Failed to publish update to Redis');
  }
}

/**
 * Subscribe to Redis channel for room updates
 */
export function subscribeToRoom(
  roomKey: string,
  callback: (update: Uint8Array) => void
): () => void {
  if (!redisSubscriber) {
    return () => {}; // No-op unsubscribe
  }

  const channel = `room:${roomKey}`;

  const messageHandler = (receivedChannel: string, message: string) => {
    if (receivedChannel === channel) {
      try {
        const update = Buffer.from(message, 'base64');
        callback(new Uint8Array(update));
      } catch (error) {
        logger.error({ error, channel }, 'Failed to decode Redis update');
      }
    }
  };

  redisSubscriber.on('message', messageHandler);
  redisSubscriber.subscribe(channel);

  logger.debug({ channel }, 'Subscribed to Redis channel');

  // Return unsubscribe function
  return () => {
    redisSubscriber?.unsubscribe(channel);
    redisSubscriber?.off('message', messageHandler);
    logger.debug({ channel }, 'Unsubscribed from Redis channel');
  };
}

/**
 * Get or create a collaboration document
 */
export async function getOrCreateCollabDoc(
  workflowId: string,
  tenantId: string,
  versionId?: string | null
): Promise<string> {
  try {
    // Try to find existing doc
    const existing = await db.query.collabDocs.findFirst({
      where: and(
        eq(collabDocs.workflowId, workflowId),
        eq(collabDocs.tenantId, tenantId),
        versionId ? eq(collabDocs.versionId, versionId) : eq(collabDocs.versionId, null)
      ),
    });

    if (existing) {
      return existing.id;
    }

    // Create new doc
    const [newDoc] = await db
      .insert(collabDocs)
      .values({
        workflowId,
        tenantId,
        versionId: versionId || null,
      })
      .returning();

    logger.info({ docId: newDoc.id, workflowId, tenantId }, 'Created new collab doc');
    return newDoc.id;
  } catch (error) {
    logger.error({ error, workflowId, tenantId }, 'Failed to get or create collab doc');
    throw error;
  }
}

/**
 * Load Yjs document from database (snapshot + updates)
 */
export async function loadDocument(docId: string): Promise<Y.Doc> {
  const doc = new Y.Doc();

  try {
    // Load latest snapshot
    const snapshot = await db.query.collabSnapshots.findFirst({
      where: eq(collabSnapshots.docId, docId),
      orderBy: [desc(collabSnapshots.clock)],
    });

    if (snapshot) {
      logger.debug({ docId, clock: snapshot.clock }, 'Loading snapshot');
      const stateBuffer = Buffer.from(snapshot.state, 'base64');
      Y.applyUpdate(doc, new Uint8Array(stateBuffer));

      // Load updates after snapshot
      const updates = await db.query.collabUpdates.findMany({
        where: and(
          eq(collabUpdates.docId, docId),
          gt(collabUpdates.seq, snapshot.clock)
        ),
        orderBy: [collabUpdates.seq],
      });

      logger.debug({ docId, updateCount: updates.length }, 'Loading updates after snapshot');

      for (const update of updates) {
        const updateBuffer = Buffer.from(update.update, 'base64');
        Y.applyUpdate(doc, new Uint8Array(updateBuffer));
      }
    } else {
      // No snapshot, load all updates
      const updates = await db.query.collabUpdates.findMany({
        where: eq(collabUpdates.docId, docId),
        orderBy: [collabUpdates.seq],
      });

      logger.debug({ docId, updateCount: updates.length }, 'Loading all updates (no snapshot)');

      for (const update of updates) {
        const updateBuffer = Buffer.from(update.update, 'base64');
        Y.applyUpdate(doc, new Uint8Array(updateBuffer));
      }
    }

    logger.info({ docId }, 'Document loaded successfully');
    return doc;
  } catch (error) {
    logger.error({ error, docId }, 'Failed to load document');
    throw error;
  }
}

/**
 * Save update to database
 */
export async function saveUpdate(docId: string, update: Uint8Array): Promise<number> {
  try {
    // Get next sequence number
    const lastUpdate = await db.query.collabUpdates.findFirst({
      where: eq(collabUpdates.docId, docId),
      orderBy: [desc(collabUpdates.seq)],
    });

    const seq = (lastUpdate?.seq || 0) + 1;

    // Save update
    const base64Update = Buffer.from(update).toString('base64');
    await db.insert(collabUpdates).values({
      docId,
      seq,
      update: base64Update,
    });

    logger.debug({ docId, seq }, 'Update saved');

    // Check if we should create a snapshot
    if (seq % SNAPSHOT_INTERVAL === 0) {
      await createSnapshot(docId, seq);
    }

    return seq;
  } catch (error) {
    logger.error({ error, docId }, 'Failed to save update');
    throw error;
  }
}

/**
 * Create a snapshot of the document state
 */
async function createSnapshot(docId: string, clock: number): Promise<void> {
  try {
    // Load current document state
    const doc = await loadDocument(docId);
    const state = Y.encodeStateAsUpdate(doc);
    const base64State = Buffer.from(state).toString('base64');

    // Save snapshot
    await db.insert(collabSnapshots).values({
      docId,
      clock,
      state: base64State,
    });

    logger.info({ docId, clock }, 'Snapshot created');

    // Optionally trim old updates (keep last UPDATES_TO_KEEP)
    const oldUpdates = await db.query.collabUpdates.findMany({
      where: and(
        eq(collabUpdates.docId, docId),
        gt(collabUpdates.seq, 0)
      ),
      orderBy: [desc(collabUpdates.seq)],
    });

    if (oldUpdates.length > UPDATES_TO_KEEP) {
      const deleteBeforeSeq = oldUpdates[UPDATES_TO_KEEP - 1].seq;
      await db
        .delete(collabUpdates)
        .where(
          and(
            eq(collabUpdates.docId, docId),
            gt(collabUpdates.seq, deleteBeforeSeq)
          )
        );

      logger.debug({ docId, deleteBeforeSeq }, 'Trimmed old updates');
    }
  } catch (error) {
    logger.error({ error, docId, clock }, 'Failed to create snapshot');
  }
}

/**
 * Export document as JSON (for publishing workflow)
 */
export async function exportDocumentAsJson(docId: string): Promise<any> {
  try {
    const doc = await loadDocument(docId);

    // Extract data from Yjs document
    const yGraph = doc.getMap('yGraph');
    const yMeta = doc.getMap('yMeta');
    const yComments = doc.getMap('yComments');

    // Convert to plain JSON
    const nodes = yGraph.get('nodes')?.toJSON() || [];
    const edges = yGraph.get('edges')?.toJSON() || [];
    const meta = yMeta.toJSON();
    const comments = {};

    yComments.forEach((value, key) => {
      comments[key] = value.toJSON();
    });

    return {
      nodes,
      edges,
      meta,
      comments,
    };
  } catch (error) {
    logger.error({ error, docId }, 'Failed to export document as JSON');
    throw error;
  }
}

/**
 * Import JSON graph into Yjs document
 */
export async function importJsonToDocument(
  docId: string,
  graphJson: any
): Promise<void> {
  try {
    const doc = await loadDocument(docId);

    doc.transact(() => {
      // Import graph data
      const yGraph = doc.getMap('yGraph');
      const yNodes = new Y.Array();
      const yEdges = new Y.Array();

      if (graphJson.nodes) {
        graphJson.nodes.forEach((node: any) => {
          const yNode = new Y.Map();
          Object.entries(node).forEach(([key, value]) => {
            yNode.set(key, value);
          });
          yNodes.push([yNode]);
        });
      }

      if (graphJson.edges) {
        graphJson.edges.forEach((edge: any) => {
          const yEdge = new Y.Map();
          Object.entries(edge).forEach(([key, value]) => {
            yEdge.set(key, value);
          });
          yEdges.push([yEdge]);
        });
      }

      yGraph.set('nodes', yNodes);
      yGraph.set('edges', yEdges);

      // Import metadata
      if (graphJson.meta) {
        const yMeta = doc.getMap('yMeta');
        Object.entries(graphJson.meta).forEach(([key, value]) => {
          yMeta.set(key, value);
        });
      }
    });

    // Save the update
    const update = Y.encodeStateAsUpdate(doc);
    await saveUpdate(docId, update);

    logger.info({ docId }, 'JSON imported to document');
  } catch (error) {
    logger.error({ error, docId }, 'Failed to import JSON to document');
    throw error;
  }
}

/**
 * Get collaboration metrics for observability
 */
export async function getCollabMetrics(docId: string): Promise<{
  updateCount: number;
  snapshotCount: number;
  lastUpdate: Date | null;
  documentSize: number;
}> {
  try {
    const updates = await db.query.collabUpdates.findMany({
      where: eq(collabUpdates.docId, docId),
    });

    const snapshots = await db.query.collabSnapshots.findMany({
      where: eq(collabSnapshots.docId, docId),
    });

    const lastUpdate = updates.length > 0
      ? updates.reduce((latest, update) =>
          update.ts > latest ? update.ts : latest,
          updates[0].ts
        )
      : null;

    const doc = await loadDocument(docId);
    const state = Y.encodeStateAsUpdate(doc);

    return {
      updateCount: updates.length,
      snapshotCount: snapshots.length,
      lastUpdate,
      documentSize: state.length,
    };
  } catch (error) {
    logger.error({ error, docId }, 'Failed to get collab metrics');
    throw error;
  }
}

/**
 * Cleanup function for graceful shutdown
 */
export async function cleanup(): Promise<void> {
  logger.info('Cleaning up collaboration persistence');

  if (redisPublisher) {
    await redisPublisher.quit();
    redisPublisher = null;
  }

  if (redisSubscriber) {
    await redisSubscriber.quit();
    redisSubscriber = null;
  }

  logger.info('Collaboration persistence cleanup complete');
}
