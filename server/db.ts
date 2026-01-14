import dotenv from "dotenv";
dotenv.config();

import * as schema from "@shared/schema";

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
async function initializeDatabase() {
  if (dbInitialized) {return;}

  const databaseUrl = process.env.DATABASE_URL;
  const isDatabaseConfigured = !!databaseUrl && databaseUrl !== 'undefined' && databaseUrl !== '';

  if (!isDatabaseConfigured) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?"
    );
  }

  // Detect if we're using Neon serverless or local PostgreSQL
  // In TEST environment, we force 'pg' (local/TCP) driver because Neon Serverless (WebSockets)
  // does not support 'search_path' in startup options, which is required for schema isolation.
  const isNeonDatabase = isDatabaseConfigured &&
    process.env.NODE_ENV !== 'test' &&
    (databaseUrl.includes('neon.tech') || databaseUrl.includes('neon.co'));

  logger.info(`DB: initializing... ${isNeonDatabase ? "Neon" : "Local"}`);
  if (isNeonDatabase) {
    // Use Neon serverless driver for cloud databases
    const { Pool: NeonPoolClass, neonConfig } = await import('@neondatabase/serverless');
    const ws = await import('ws');

    neonConfig.webSocketConstructor = ws.default;
    pool = new NeonPoolClass({ connectionString: databaseUrl });

    const { drizzle: drizzleNeon } = await import('drizzle-orm/neon-serverless');
    _db = drizzleNeon(pool as any, { schema });
  } else {
    // Use standard PostgreSQL driver for local databases
    logger.debug("DB: importing pg...");
    const pg = await import('pg');
    logger.debug("DB: creating pool...");
    pool = new pg.default.Pool({ connectionString: databaseUrl });
    logger.debug("DB: importing drizzle...");
    const { drizzle: drizzlePg } = await import('drizzle-orm/node-postgres');
    _db = drizzlePg(pool as any, { schema });
    logger.debug("DB: created.");
  }

  dbInitialized = true;
  logger.info("DB: initialized flag set.");
}

// Start initialization immediately only if database is configured
// If not configured, create a lazy promise that will reject when awaited
// For tests, we might initialize later manually
const initialDatabaseUrl = process.env.DATABASE_URL;
const isInitialConfigured = !!initialDatabaseUrl && initialDatabaseUrl !== 'undefined' && initialDatabaseUrl !== '';
const isTest = process.env.NODE_ENV === 'test';

if (isInitialConfigured) {
  if (isTest) {
    console.log("DB: Skipping auto-init because NODE_ENV=test");
  } else {
    console.log("DB: Auto-initializing...");
  }
} else {
  console.log("DB: Not auto-initializing because DATABASE_URL is missing/empty");
}

dbInitPromise = (isInitialConfigured && !isTest)
  ? initializeDatabase()
  : Promise.resolve();

// Getter to ensure db is initialized before use
function getDb() {
  if (!dbInitialized) {
    throw new Error("Database not initialized. Call await initializeDatabase() first.");
  }
  return _db;
}

// Close database connection (useful for tests)
async function closeDatabase() {
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
  get(target, prop) {
    if (!_db) {
      throw new Error("Database not initialized. Call await initializeDatabase() first.");
    }
    return _db[prop as keyof DrizzleDB];
  },
  set(target, prop, value) {
    if (!_db) {
      throw new Error("Database not initialized. Call await initializeDatabase() first.");
    }
    (_db as any)[prop] = value;
    return true;
  }
});

export { pool, db, getDb, initializeDatabase, closeDatabase, dbInitPromise };
