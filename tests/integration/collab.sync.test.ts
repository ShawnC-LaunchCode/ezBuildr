import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

import { db } from '../../server/db';
import { shutdown } from '../../server/realtime/collabServer';
import { authService } from '../../server/services/AuthService';
import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';

import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * DEBT-3b: real-time collaboration sync had no test at all.
 *
 * The previous attempt (tests/unit/collab.server.test.ts) connected two
 * sockets, waited a second, closed them, and asserted nothing -- and it could
 * never have run regardless: its whole describe block is gated on
 * COLLAB_SERVER_URL, which nothing in the repo sets, and it pointed at a
 * hardcoded ws://localhost:5174 that nothing starts.
 *
 * This drives the actual y-websocket protocol against a collab server attached
 * to the integration harness's real HTTP server, so it needs no external setup.
 * It lives in tests/integration/ rather than tests/unit/ because the server
 * calls loadDocument(), which requires a database -- a unit-fast test must not
 * touch the network or a DB.
 *
 * This is also the safety net DEBT-10's yjs bump is waiting on: it exercises
 * encode/decode and CRDT convergence, not just socket liveness.
 */

const MESSAGE_SYNC = 0;

interface CollabClient {
  ws: WebSocket;
  doc: Y.Doc;
}

/**
 * Minimal y-websocket client: performs the sync handshake, applies remote
 * updates into its own Y.Doc, and forwards local edits to the server.
 */
async function connectClient(wsUrl: string): Promise<CollabClient> {
  const doc = new Y.Doc();
  const ws = new WebSocket(wsUrl);

  // The socket opens as soon as the HTTP upgrade completes, but the server
  // only attaches its message handler after an async authenticate +
  // loadDocument. Anything sent in that window is silently dropped, so
  // "connected" is not "ready" -- readiness is the server's initial sync
  // arriving, which it sends immediately after wiring those handlers up.
  let markReady: () => void;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  ws.on('message', (data: Buffer) => {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const messageType = decoding.readVarUint(decoder);
    if (messageType !== MESSAGE_SYNC) {
      return; // awareness traffic is not what this test asserts
    }
    markReady();
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    // 'remote' marks the transaction origin so the update handler below does
    // not bounce the server's own update straight back at it.
    syncProtocol.readSyncMessage(decoder, encoder, doc, 'remote');
    if (encoding.length(encoder) > 1 && ws.readyState === WebSocket.OPEN) {
      ws.send(encoding.toUint8Array(encoder));
    }
  });

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote' || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    ws.send(encoding.toUint8Array(encoder));
  });

  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  // Wait for the server's initial sync before announcing our own state, so we
  // know its handlers are live and nothing we send is dropped.
  await ready;

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  ws.send(encoding.toUint8Array(encoder));

  return { ws, doc };
}

/**
 * Bounded wait on a condition. Deliberately not a fixed-duration sleep -- the
 * old test's `setTimeout(1000)` is exactly why it passed while verifying
 * nothing.
 */
async function waitForCondition(
  predicate: () => boolean,
  description: string,
  timeoutMs = 10000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${description}`);
}

describe.sequential('Collaboration sync (DEBT-3b)', () => {
  let ctx: IntegrationTestContext;
  let wsBase: string;
  let roomKey: string;
  let collabToken: string;
  const clients: CollabClient[] = [];

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ createProject: true });

    const workflowResponse = await request(ctx.baseURL)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ projectId: ctx.projectId, title: 'Collab Sync WF', name: 'collab_sync_wf' })
      .expect(201);

    roomKey = `tenant:${ctx.tenantId}:workflow:${workflowResponse.body.id}`;

    // ctx.authToken is minted at registration, before the harness assigns the
    // tenant, so its tenantId claim is null and the collab server rejects it as
    // a cross-tenant attempt. Re-mint from the persisted user row.
    const [user] = await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    collabToken = authService.createToken(user);

    // No initCollabServer() call here on purpose: registerRoutes already wires
    // it to the harness's HTTP server (server/routes.ts:48). Attaching a second
    // WebSocketServer to the same path makes both answer the upgrade, which ws
    // reports as "handleUpgrade() was called more than once with the same
    // socket" while the tests still appear to pass.
    wsBase = `${ctx.baseURL.replace('http://', 'ws://')}/collab`;
  }, 60000);

  afterAll(async () => {
    for (const client of clients) {
      client.ws.close();
      client.doc.destroy();
    }
    await shutdown();
    await ctx.cleanup();
  }, 60000);

  function url(): string {
    return `${wsBase}?room=${encodeURIComponent(roomKey)}&token=${collabToken}`;
  }

  it('propagates an edit from one client to another as a converged Y.Doc value', async () => {
    const clientA = await connectClient(url());
    const clientB = await connectClient(url());
    clients.push(clientA, clientB);

    clientA.doc.transact(() => {
      clientA.doc.getMap('yGraph').set('testKey', 'testValue');
    });

    await waitForCondition(
      () => clientB.doc.getMap('yGraph').get('testKey') === 'testValue',
      "client B's yGraph to contain testKey"
    );

    expect(clientB.doc.getMap('yGraph').get('testKey')).toBe('testValue');
  }, 30000);

  it('converges concurrent edits from both clients rather than losing one', async () => {
    const clientA = await connectClient(url());
    const clientB = await connectClient(url());
    clients.push(clientA, clientB);

    // Both write different keys at the same time. A CRDT must keep both; a
    // last-write-wins broadcast would drop one.
    clientA.doc.transact(() => {
      clientA.doc.getMap('yGraph').set('fromA', 'a');
    });
    clientB.doc.transact(() => {
      clientB.doc.getMap('yGraph').set('fromB', 'b');
    });

    await waitForCondition(
      () =>
        clientA.doc.getMap('yGraph').get('fromB') === 'b' &&
        clientB.doc.getMap('yGraph').get('fromA') === 'a',
      'both clients to hold both keys'
    );

    expect(clientA.doc.getMap('yGraph').get('fromA')).toBe('a');
    expect(clientA.doc.getMap('yGraph').get('fromB')).toBe('b');
    expect(clientB.doc.getMap('yGraph').get('fromA')).toBe('a');
    expect(clientB.doc.getMap('yGraph').get('fromB')).toBe('b');
  }, 30000);

  it('sends a late joiner the state that already existed in the room', async () => {
    const clientA = await connectClient(url());
    clients.push(clientA);

    clientA.doc.transact(() => {
      clientA.doc.getMap('yGraph').set('earlyKey', 'earlyValue');
    });

    // Give the server the edit before anyone else joins.
    await waitForCondition(
      () => clientA.doc.getMap('yGraph').get('earlyKey') === 'earlyValue',
      'client A to hold its own edit'
    );

    const lateClient = await connectClient(url());
    clients.push(lateClient);

    await waitForCondition(
      () => lateClient.doc.getMap('yGraph').get('earlyKey') === 'earlyValue',
      'the late joiner to receive pre-existing room state'
    );

    expect(lateClient.doc.getMap('yGraph').get('earlyKey')).toBe('earlyValue');
  }, 30000);
});
