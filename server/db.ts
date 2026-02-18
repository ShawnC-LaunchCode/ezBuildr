import dotenv from "dotenv";
dotenv.config();

import * as schema from "@shared/schema";

import { env } from "./config/env";
import { logger } from './logger';

import type { Pool as NeonPool } from '@neondatabase/serverless';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

type DrizzleDB = NodePgDatabase<typeof schema> | NeonDatabase<typeof schema>;

let pool: Pool | NeonPool;
let _db: DrizzleDB | null = null;  // Internal db reference
let dbInitialized = false;
let dbInitPromise: Promise<void>;

// Initialize database connection
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function initializeDatabase() {
  if (dbInitialized) { return; }

  const databaseUrl = env.DATABASE_URL;
  const isDatabaseConfigured = Boolean(databaseUrl) && databaseUrl !== 'undefined' && databaseUrl !== '';

  if (!isDatabaseConfigured) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?"
    );
  }

  // Detect if we're using Neon serverless or local PostgreSQL
  // In TEST environment, we force 'pg' (local/TCP) driver because Neon Serverless (WebSockets)
  // does not support 'search_path' in startup options, which is required for schema isolation.
  const isNeonDatabase = isDatabaseConfigured &&
    env.NODE_ENV !== 'test' &&
    (databaseUrl.includes('neon.tech') || databaseUrl.includes('neon.co'));

  logger.info(`DB: initializing... ${isNeonDatabase ? "Neon" : "Local"}`);
  if (isNeonDatabase) {
    // Use Neon serverless driver for cloud databases
    const { Pool: NeonPoolClass, neonConfig } = await import('@neondatabase/serverless');
    const ws = await import('ws');

    neonConfig.webSocketConstructor = ws.default;
    pool = new NeonPoolClass({ connectionString: databaseUrl });

    const { drizzle: drizzleNeon } = await import('drizzle-orm/neon-serverless');
    _db = drizzleNeon(pool, { schema });
  } else {
    // Use standard PostgreSQL driver for local databases
    logger.debug("DB: importing pg...");
    const pg = await import('pg');

    logger.debug("DB: creating pool...");
    pool = new pg.default.Pool({ connectionString: databaseUrl });

    const testSchema = process.env.TEST_SCHEMA ?? (global as Record<string, unknown>).__TEST_SCHEMA__;
    if (testSchema && env.NODE_ENV === 'test') {
      // Wrap pool.connect to guarantee search_path is set before any queries.
      // The async pool.on('connect') handler has a race condition where queries
      // can execute before the handler completes. This wrapper ensures the
      // search_path SET completes before the client is returned to the caller.
      const originalConnect = pool.connect.bind(pool);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pool as any).connect = async function(callback?: any) {
        if (callback) {
          // Callback-style: pool.connect((err, client, release) => ...)
          return originalConnect(async (err: Error | undefined, client: any, release: () => void) => {
            if (!err && client) {
              try {
                await client.query(`SET search_path TO "${String(testSchema)}", public`);
              } catch (e: unknown) {
                logger.warn(`DB: Failed to set search_path: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            callback(err, client, release);
          });
        }
        // Promise-style: const client = await pool.connect()
        const client = await originalConnect();
        try {
          await client.query(`SET search_path TO "${String(testSchema)}", public`);
        } catch (e: unknown) {
          logger.warn(`DB: Failed to set search_path: ${e instanceof Error ? e.message : String(e)}`);
        }
        return client;
      };
      logger.info(`DB: Pool.connect wrapped to set search_path="${String(testSchema)}",public`);
    }

    logger.debug("DB: importing drizzle...");
    const { drizzle: drizzlePg } = await import('drizzle-orm/node-postgres');
    _db = drizzlePg(pool, { schema });
    logger.debug("DB: created.");
  }

  dbInitialized = true;
  logger.info("DB: initialized flag set.");
}

// Start initialization immediately only if database is configured
// If not configured, create a lazy promise that will reject when awaited
// For tests, we might initialize later manually
const initialDatabaseUrl = env.DATABASE_URL;
const isInitialConfigured = Boolean(initialDatabaseUrl) && initialDatabaseUrl !== 'undefined' && initialDatabaseUrl !== '';
const isTest = env.NODE_ENV === 'test';

if (isInitialConfigured) {
  // eslint-disable-next-line no-console
  if (isTest) {
    // eslint-disable-next-line no-console
    console.log("DB: Skipping auto-init because NODE_ENV=test");
    // eslint-disable-next-line no-console
  } else {
    // eslint-disable-next-line no-console
    console.log("DB: Auto-initializing...");
  }
  // eslint-disable-next-line no-console
} else {
  // eslint-disable-next-line no-console
  console.log("DB: Not auto-initializing because DATABASE_URL is missing/empty");
}

// eslint-disable-next-line prefer-const
dbInitPromise = (isInitialConfigured && !isTest)
  ? initializeDatabase()
  : Promise.resolve();

// Getter to ensure db is initialized before use
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function getDb() {
  if (!dbInitialized) {
    throw new Error("Database not initialized. Call await initializeDatabase() first.");
  }
  return _db;
}

// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
// Close database connection (useful for tests)
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function closeDatabase() {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (pool) {
    logger.info("DB: closing pool...");
    await pool.end();
    dbInitialized = false;
    _db = null;
    logger.info("DB: pool closed.");
  }
}

// Create a getter for db that returns the initialized database
// This ensures that code importing { db } will get the properly initialized instance
const db = new Proxy({} as DrizzleDB, {
  get(_target, prop) {
    if (!_db) {
      throw new Error("Database not initialized. Call await initializeDatabase() first.");
    }
    if (typeof prop === 'symbol') { return (_db as any)[prop]; }
    return _db[prop as keyof DrizzleDB];
  },
  set(_target, prop, value) {
    if (!_db) {
      throw new Error("Database not initialized. Call await initializeDatabase() first.");
    }
    if (typeof prop === 'symbol') { return true; }
    (_db as unknown as Record<string, unknown>)[prop] = value;
    return true;
  }
});

export { pool, db, getDb, initializeDatabase, closeDatabase, dbInitPromise };
