import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";
/**
 * Create an in-memory SQLite database for tests
 * This mimics the PostgreSQL schema but uses SQLite for fast testing
 */
export function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  // Create tables matching our schema
  // Note: SQLite syntax differs slightly from PostgreSQL
  // Users table
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      first_name TEXT,
      last_name TEXT,
      profile_image_url TEXT,
      role TEXT NOT NULL DEFAULT 'creator',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Surveys table
  sqlite.exec(`
    CREATE TABLE surveys (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      creator_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      allow_anonymous INTEGER NOT NULL DEFAULT 0,
      anonymous_access_type TEXT DEFAULT 'disabled',
      public_link TEXT UNIQUE,
      anonymous_config TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  // Survey pages table
  sqlite.exec(`
    CREATE TABLE survey_pages (
      id TEXT PRIMARY KEY,
      survey_id TEXT NOT NULL,
      title TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    );
  `);
  // Questions table
  sqlite.exec(`
    CREATE TABLE questions (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      required INTEGER NOT NULL DEFAULT 0,
      options TEXT,
      loop_config TEXT,
      conditional_logic TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (page_id) REFERENCES survey_pages(id) ON DELETE CASCADE
    );
  `);
  // Responses table
  sqlite.exec(`
    CREATE TABLE responses (
      id TEXT PRIMARY KEY,
      survey_id TEXT NOT NULL,
      recipient_id TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      submitted_at TEXT,
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      ip_address TEXT,
      user_agent TEXT,
      session_id TEXT,
      anonymous_metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    );
  `);
  // Answers table
  sqlite.exec(`
    CREATE TABLE answers (
      id TEXT PRIMARY KEY,
      response_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      subquestion_id TEXT,
      loop_index INTEGER,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );
  `);
  // Analytics events table
  sqlite.exec(`
    CREATE TABLE analytics_events (
      id TEXT PRIMARY KEY,
      response_id TEXT NOT NULL,
      survey_id TEXT NOT NULL,
      page_id TEXT,
      question_id TEXT,
      event TEXT NOT NULL,
      data TEXT,
      duration INTEGER,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    );
  `);
  return { db, sqlite };
}
/**
 * Clean up test database
 */
export function cleanupTestDb(sqlite: Database.Database) {
  sqlite.close();
}