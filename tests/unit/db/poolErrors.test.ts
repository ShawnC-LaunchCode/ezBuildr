/**
 * A dropped idle connection must not take the server down.
 *
 * A pg / Neon pool emits 'error' when a connection sitting idle in it dies, and
 * Node throws on an 'error' event nobody listens to. Observed 2026-09-14: the Neon
 * dev database dropped an idle connection and the local server exited with
 * "Unhandled 'error' event ... Connection terminated unexpectedly". Both pools
 * (app and admin) are created the same way in production.
 *
 * `pg` is replaced by an EventEmitter-backed fake that records every pool it
 * creates, so this checks the REAL initializeDatabase / initializeAdminDb wiring
 * without a database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface RecordedPool {
  listenerCount(event: string): number;
  emit(event: string, ...args: unknown[]): boolean;
}

const { pools, logger } = vi.hoisted(() => ({
  pools: [] as RecordedPool[],
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('pg', async () => {
  const { EventEmitter } = await import('node:events');
  class Pool extends EventEmitter {
    constructor(readonly options: unknown) {
      super();
      pools.push(this);
    }
    connect(): Promise<unknown> { return Promise.resolve({}); }
    end(): Promise<void> { return Promise.resolve(); }
  }
  return { default: { Pool } };
});
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: () => ({}) }));
vi.mock('../../../server/logger', () => ({ logger, default: logger }));

const LOCAL_URL = 'postgresql://probe:probe@localhost:5999/probe';
const DROPPED = new Error('Connection terminated unexpectedly');

describe('Postgres pool error handling', () => {
  const savedEnv = { DATABASE_URL: process.env.DATABASE_URL, ADMIN_DATABASE_URL: process.env.ADMIN_DATABASE_URL };

  beforeEach(() => {
    vi.resetModules();
    pools.length = 0;
    logger.error.mockClear();
  });
  afterEach(() => {
    // Assigning `undefined` to process.env stores the STRING "undefined", which
    // the env schema then rejects as a URL — delete unset keys instead.
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('without a listener, a pool error throws — which is what killed the process', async () => {
    const { EventEmitter } = await import('node:events');
    expect(() => new EventEmitter().emit('error', DROPPED)).toThrow('Connection terminated unexpectedly');
  });

  it('handlePoolErrors turns a dropped connection into a logged error', async () => {
    const { EventEmitter } = await import('node:events');
    const { handlePoolErrors } = await import('../../../server/db/poolErrors');
    const pool = new EventEmitter();
    handlePoolErrors(pool, 'app');

    expect(() => pool.emit('error', DROPPED)).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: DROPPED, pool: 'app' }), expect.any(String));
  });

  it('a connection dropped while CHECKED OUT is handled too, not just an idle one', async () => {
    // The pool forwards errors only from idle connections; a checked-out one
    // (held by a transaction) emits on the client itself. That is the crash
    // the pool-level listener alone did not stop.
    const { EventEmitter } = await import('node:events');
    const { handlePoolErrors } = await import('../../../server/db/poolErrors');
    const pool = new EventEmitter();
    handlePoolErrors(pool, 'app');

    const client = new EventEmitter();
    pool.emit('connect', client); // pg-pool emits this once per new connection

    expect(client.listenerCount('error')).toBe(1);
    expect(() => client.emit('error', DROPPED)).not.toThrow();
  });

  it('initializeDatabase attaches the handler to the app pool', async () => {
    process.env.DATABASE_URL = LOCAL_URL;
    const { initializeDatabase, closeDatabase } = await import('../../../server/db');
    await initializeDatabase();
    try {
      expect(pools).toHaveLength(1);
      expect(pools[0].listenerCount('error')).toBe(1);
      expect(() => pools[0].emit('error', DROPPED)).not.toThrow();
    } finally {
      await closeDatabase();
    }
  });

  it('initializeAdminDb attaches the handler to the admin pool', async () => {
    process.env.DATABASE_URL = LOCAL_URL; // the env schema validates it on import
    process.env.ADMIN_DATABASE_URL = LOCAL_URL;
    const { initializeAdminDb, closeAdminDb } = await import('../../../server/db/adminDb');
    await initializeAdminDb();
    try {
      expect(pools).toHaveLength(1);
      expect(pools[0].listenerCount('error')).toBe(1);
      expect(() => pools[0].emit('error', DROPPED)).not.toThrow();
    } finally {
      await closeAdminDb();
    }
  });
});
