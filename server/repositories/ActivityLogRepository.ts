import { sql } from "drizzle-orm";

import { activityLogSource } from "../config/activityLog.config";
import { db } from "../db";
import { ActivityLog, ActivityLogQuery, ActivityLogInsert, ActivityLogResult } from "../types/activityLog";

import type { DbTransaction } from "./BaseRepository";

/**
 * Schema-Agnostic Activity Log Repository
 *
 * This repository uses raw SQL queries based on the configuration in activityLog.config.ts
 * This allows it to work with any table structure by mapping logical fields to actual columns.
 *
 * Default configuration uses the existing analyticsEvents table.
 */
export class ActivityLogRepository {
  private readonly tableName = activityLogSource.table;
  private readonly columns = activityLogSource.columns;

  /**
   * Get database instance (supports transactions)
   */
  private getDb(tx?: DbTransaction) {
    return tx || db;
  }

  /**
   * Find activity logs with filtering, pagination, and sorting
   */
  async find(query: ActivityLogQuery, tx?: DbTransaction): Promise<ActivityLogResult> {
    const {
      q,
      event,
      actor,
      entityType,
      entityId,
      status,
      from,
      to,
      limit = 50,
      offset = 0,
      sort = "timestamp_desc"
    } = query || {};

    const database = this.getDb(tx);

    // Build WHERE conditions
    const conditions: any[] = [];
    const params: Record<string, any> = {};

    // Free text search: search across event and actorEmail (if available)
    if (q) {
      const searchConditions: any[] = [
        sql`${sql.raw(this.columns.event)} ILIKE ${`%${  q  }%`}`
      ];
      if (this.columns.actorEmail) {
        searchConditions.push(
          sql`${sql.raw(this.columns.actorEmail)} ILIKE ${`%${  q  }%`}`
        );
      }
      conditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
    }

    // Event filter
    if (event && this.columns.event) {
      conditions.push(sql`${sql.raw(this.columns.event)} = ${event}`);
    }

    // Actor filter (use ILIKE for partial email matching, only use ID if it looks like a UUID)
    if (actor) {
      if (this.columns.actorEmail) {
        // Use ILIKE for partial matching (e.g., "scooter" matches "scooter4356@gmail.com")
        conditions.push(sql`${sql.raw(this.columns.actorEmail)} ILIKE ${`%${  actor  }%`}`);
      } else if (this.columns.actorId) {
        // Only try to match by ID if the input looks like a valid UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(actor)) {
          conditions.push(sql`${sql.raw(this.columns.actorId)} = ${actor}`);
        }
      }
    }

    // Entity type filter
    if (entityType && this.columns.entityType) {
      conditions.push(sql`${sql.raw(this.columns.entityType)} = ${entityType}`);
    }

    // Entity ID filter
    if (entityId && this.columns.entityId) {
      conditions.push(sql`${sql.raw(this.columns.entityId)} = ${entityId}`);
    }

    // Status filter
    if (status && this.columns.status) {
      conditions.push(sql`${sql.raw(this.columns.status)} = ${status}`);
    }

    // Date range filters
    if (from && this.columns.timestamp) {
      conditions.push(sql`${sql.raw(this.columns.timestamp)} >= ${from}::timestamptz`);
    }
    if (to && this.columns.timestamp) {
      conditions.push(sql`${sql.raw(this.columns.timestamp)} <= ${to}::timestamptz`);
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    // Get total count
    const countQuery = sql`
      SELECT COUNT(*)::int AS total
      FROM ${sql.raw(this.tableName)}
      ${whereClause}
    `;

    const countResult = await database.execute(countQuery);
    const total = (countResult.rows[0])?.total ?? 0;

    // Build SELECT columns
    const selectColumns = [
      sql`${sql.raw(this.columns.id)} as id`,
      sql`${sql.raw(this.columns.timestamp)} as timestamp`,
      sql`${sql.raw(this.columns.event)} as event`,
      this.columns.actorId
        ? sql`${sql.raw(this.columns.actorId)} as "actorId"`
        : sql`NULL as "actorId"`,
      this.columns.actorEmail
        ? sql`${sql.raw(this.columns.actorEmail)} as "actorEmail"`
        : sql`NULL as "actorEmail"`,
      this.columns.entityType
        ? sql`${sql.raw(this.columns.entityType)} as "entityType"`
        : sql`NULL as "entityType"`,
      this.columns.entityId
        ? sql`${sql.raw(this.columns.entityId)} as "entityId"`
        : sql`NULL as "entityId"`,
      this.columns.status
        ? sql`${sql.raw(this.columns.status)} as status`
        : sql`NULL as status`,
      this.columns.ipAddress
        ? sql`${sql.raw(this.columns.ipAddress)} as "ipAddress"`
        : sql`NULL as "ipAddress"`,
      this.columns.userAgent
        ? sql`${sql.raw(this.columns.userAgent)} as "userAgent"`
        : sql`NULL as "userAgent"`,
      this.columns.metadata
        ? sql`${sql.raw(this.columns.metadata)} as metadata`
        : sql`NULL as metadata`
    ];

    // Determine sort order
    const orderDirection = sort === "timestamp_asc" ? sql`ASC` : sql`DESC`;
    const orderBy = sql`ORDER BY ${sql.raw(this.columns.timestamp)} ${orderDirection}`;

    // Build main query
    const dataQuery = sql`
      SELECT ${sql.join(selectColumns, sql`, `)}
      FROM ${sql.raw(this.tableName)}
      ${whereClause}
      ${orderBy}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const dataResult = await database.execute(dataQuery);
    const rows = dataResult.rows as ActivityLog[];

    return { rows, total };
  }

  /**
   * Insert a new activity log entry (optional - for manual logging)
   *
   * Note: If you're already logging via analyticsEvents, you may not need this.
   * This method only maps columns that exist in the configuration.
   */
  async insert(entry: ActivityLogInsert, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);

    const columns: string[] = [];
    const values: any[] = [];
    const placeholders: any[] = [];

    // Helper to add a column if it exists in config
    const addColumn = (configKey: keyof typeof this.columns, value: any) => {
      const columnName = this.columns[configKey];
      if (!columnName || value === undefined) {return;}

      columns.push(columnName);
      values.push(value);
      placeholders.push(sql`${value}`);
    };

    // Map fields to columns
    addColumn("id", entry.id || sql`gen_random_uuid()`);
    addColumn("timestamp", entry.timestamp || new Date().toISOString());
    addColumn("event", entry.event);
    addColumn("actorId", entry.actorId ?? null);
    addColumn("actorEmail", entry.actorEmail ?? null);
    addColumn("entityType", entry.entityType ?? null);
    addColumn("entityId", entry.entityId ?? null);
    addColumn("status", entry.status ?? "info");
    addColumn("ipAddress", entry.ipAddress ?? null);
    addColumn("userAgent", entry.userAgent ?? null);
    addColumn("metadata", entry.metadata ?? null);

    if (columns.length === 0) {
      throw new Error("No valid columns to insert");
    }

    // Build INSERT query
    const insertQuery = sql`
      INSERT INTO ${sql.raw(this.tableName)} (${sql.raw(columns.join(", "))})
      VALUES (${sql.join(placeholders, sql`, `)})
    `;

    await database.execute(insertQuery);
  }

  /**
   * Get unique event types (for filter dropdowns)
   */
  async getUniqueEvents(tx?: DbTransaction): Promise<string[]> {
    const database = this.getDb(tx);

    const query = sql`
      SELECT DISTINCT ${sql.raw(this.columns.event)} as event
      FROM ${sql.raw(this.tableName)}
      WHERE ${sql.raw(this.columns.event)} IS NOT NULL
      ORDER BY ${sql.raw(this.columns.event)}
    `;

    const result = await database.execute(query);
    return (result.rows as any[]).map(row => row.event);
  }

  /**
   * Get unique actors (for filter dropdowns)
   */
  async getUniqueActors(tx?: DbTransaction): Promise<string[]> {
    const database = this.getDb(tx);

    // Try actorEmail first, fallback to actorId
    const actorColumn = this.columns.actorEmail || this.columns.actorId;
    if (!actorColumn) {return [];}

    const query = sql`
      SELECT DISTINCT ${sql.raw(actorColumn)} as actor
      FROM ${sql.raw(this.tableName)}
      WHERE ${sql.raw(actorColumn)} IS NOT NULL
      ORDER BY ${sql.raw(actorColumn)}
      LIMIT 100
    `;

    const result = await database.execute(query);
    return (result.rows as any[]).map(row => row.actor);
  }
}
