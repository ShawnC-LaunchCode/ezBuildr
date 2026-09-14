import { logger } from '../logger';

interface ErrorEmittingClient {
  on(event: 'error', listener: (err: Error) => void): unknown;
}

/** The part of a pg / Neon pool this needs: both are EventEmitters. */
interface ErrorEmittingPool {
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'connect', listener: (client: ErrorEmittingClient) => void): unknown;
}

/**
 * Keep a dropped idle connection from killing the process.
 *
 * A pool emits `'error'` when a connection sitting IDLE in it dies — the
 * database restarted, a proxy or Neon closed it, the network blipped. Node
 * throws on an `'error'` event with no listener, so without this the whole
 * server exits with "Unhandled 'error' event ... Connection terminated
 * unexpectedly". Observed 2026-09-14 on a local server against the Neon dev
 * database; production creates its pools the same way.
 *
 * Logging is all that is needed: pg-pool already discards the dead client and
 * opens a fresh one on the next checkout. A query IN FLIGHT on a dropped
 * connection still fails normally, with the error delivered to its caller.
 */
export function handlePoolErrors(pool: ErrorEmittingPool, poolName: string): void {
  pool.on('error', (err: Error) => {
    logger.error({ err, pool: poolName }, 'Postgres pool: an idle connection was dropped; it will be replaced on next use');
  });

  // The pool only forwards errors from connections sitting IDLE in it. A
  // connection that is checked out — a transaction holds one for its whole
  // duration — emits a drop on the CLIENT, and with no listener there Node
  // throws and the process dies the same way ("Emitted 'error' event on Client
  // instance", seen 2026-09-14 after the pool listener above was added).
  // 'connect' fires once per new connection, so this listener stays with it
  // whether idle or checked out. The query or transaction using it still fails
  // normally, and the broken connection is discarded when it is released.
  pool.on('connect', (client: ErrorEmittingClient) => {
    client.on('error', (err: Error) => {
      logger.error({ err, pool: poolName }, 'Postgres connection dropped while checked out; the query using it will fail and it will be discarded');
    });
  });
}
