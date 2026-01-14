import { beforeAll, afterAll, beforeEach } from "vitest";

import { createTestDb, cleanupTestDb } from "./testDb";

import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

// Global test database instances
export let testDb: BetterSQLite3Database<any>;
export let testSqlite: Database.Database;

/**
 * Setup test database before all tests
 */
beforeAll(() => {
  const { db, sqlite } = createTestDb();
  testDb = db;
  testSqlite = sqlite;
  console.log("✓ Test database initialized");
});

/**
 * Clean up database after all tests
 */
afterAll(() => {
  if (testSqlite) {
    cleanupTestDb(testSqlite);
    console.log("✓ Test database cleaned up");
  }
});

/**
 * Clear all tables before each test
 */
beforeEach(() => {
  // Clear tables in reverse order of dependencies
  testSqlite.exec(`DELETE FROM analytics_events`);
  testSqlite.exec(`DELETE FROM answers`);
  testSqlite.exec(`DELETE FROM responses`);
  testSqlite.exec(`DELETE FROM questions`);
  testSqlite.exec(`DELETE FROM survey_pages`);
  testSqlite.exec(`DELETE FROM surveys`);
  testSqlite.exec(`DELETE FROM users`);
});
