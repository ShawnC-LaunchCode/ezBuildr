import { sql, type SQL } from "drizzle-orm";

import { activityLogSource } from "../config/activityLog.config";
import { db } from "../db";
import { ActivityLog, ActivityLogQuery, ActivityLogInsert, ActivityLogResult } from "../types/activityLog";

import type { DbTransaction } from "./BaseRepository";

interface RawRowsResult {
  rows: Array<Record<string, unknown>>;
}

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
  private getDb(tx?: DbTransaction): typeof db | DbTransaction {
    return tx ?? db;
  }

  /**
   * Helper to safely prefix columns with table name
   */
  private col(name: string): string {
    return `${this.tableName}.${name}`;
  }

  /**
   * Find activity logs with filtering, pagination, and sorting
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity, complexity
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
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    } = query || {};

    const database = this.getDb(tx);

    // Build WHERE conditions
    const conditions: SQL[] = [];

    // Free text search: search across event and actorEmail (if available)
    if (q !== null && q !== undefined && q !== '') {
      const qSafe = String(q).slice(0, 100).replace(/[%_\\]/g, '\\$&');
      const qLike = `%${qSafe}%`;
      const searchConditions: SQL[] = [
        sql`${sql.raw(this.col(this.columns.event))} ILIKE ${qLike}`
      ];
      if (this.columns.actorEmail !== null && this.columns.actorEmail !== undefined) {
        searchConditions.push(
          sql`${sql.raw(this.col(this.columns.actorEmail))} ILIKE ${qLike}`
        );
      }
      const orSep = sql` OR `;
      conditions.push(sql`(${sql.join(searchConditions, orSep)})`);
    }

    // Event filter
    if (event !== null && event !== undefined && this.columns.event) {
      conditions.push(sql`${sql.raw(this.col(this.columns.event))} = ${event}`);
    }

    // Actor filter (use ILIKE for partial email matching, only use ID if it looks like a UUID)
    if (actor !== null && actor !== undefined) {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (this.columns.actorEmail) {
        // Use ILIKE for partial matching (e.g., "scooter" matches "scooter4356@gmail.com")
        const actorSafe = String(actor).slice(0, 100).replace(/[%_\\]/g, '\\$&');
        const actorLike = `%${actorSafe}%`;
        conditions.push(sql`${sql.raw(this.col(this.columns.actorEmail))} ILIKE ${actorLike}`);
      } else if (this.columns.actorId !== null && this.columns.actorId !== undefined) {
        // Only try to match by ID if the input looks like a valid UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(actor)) {
          conditions.push(sql`${sql.raw(this.col(this.columns.actorId))} = ${actor}`);
        }
      }
    }

    // Entity type filter
    if (entityType !== null && entityType !== undefined && this.columns.entityType) {
      conditions.push(sql`${sql.raw(this.col(this.columns.entityType))} = ${entityType}`);
    }

    // Entity ID filter
    if (entityId !== null && entityId !== undefined && this.columns.entityId) {
      conditions.push(sql`${sql.raw(this.col(this.columns.entityId))} = ${entityId}`);
    }

    // Status filter
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (status !== null && status !== undefined && this.columns.status) {
      conditions.push(sql`${sql.raw(this.col(this.columns.status))} = ${status}`);
    }

    // Date range filters
    if (from !== null && from !== undefined && this.columns.timestamp) {
      conditions.push(sql`${sql.raw(this.col(this.columns.timestamp))} >= ${from}::timestamptz`);
    }
    if (to !== null && to !== undefined && this.columns.timestamp) {
      conditions.push(sql`${sql.raw(this.col(this.columns.timestamp))} <= ${to}::timestamptz`);
    }

    // Build WHERE clause
    const andSep = sql` AND `;
    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, andSep)}`
      : sql``;

    // Get total count
    const countQuery = sql`
      SELECT COUNT(*)::int AS total
      FROM ${sql.raw(this.tableName)}
      ${whereClause}
    `;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const countResult = await database.execute(countQuery);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const total = (countResult.rows[0])?.total ?? 0;

    // Build SELECT columns
    const selectColumns = [
      sql`${sql.raw(this.col(this.columns.id))} as id`,
      sql`${sql.raw(this.col(this.columns.timestamp))} as timestamp`,
      sql`${sql.raw(this.col(this.columns.event))} as event`,
      this.columns.actorId
        ? sql`${sql.raw(this.col(this.columns.actorId))} as "actorId"`
        : sql`NULL as "actorId"`,
      this.columns.actorId
        ? sql`users.email as "actorEmail"`
        : sql`NULL as "actorEmail"`,
      this.columns.entityType
        ? sql`${sql.raw(this.col(this.columns.entityType))} as "entityType"`
        : sql`NULL as "entityType"`,
      this.columns.entityId
        ? sql`${sql.raw(this.col(this.columns.entityId))} as "entityId"`
        : sql`NULL as "entityId"`,
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      this.columns.status
        ? sql`${sql.raw(this.col(this.columns.status))} as status`
        : sql`NULL as status`,
      this.columns.ipAddress
        ? sql`${sql.raw(this.col(this.columns.ipAddress))} as "ipAddress"`
        : sql`NULL as "ipAddress"`,
      this.columns.userAgent
        ? sql`${sql.raw(this.col(this.columns.userAgent))} as "userAgent"`
        : sql`NULL as "userAgent"`,
      this.columns.metadata
        ? sql`${sql.raw(this.col(this.columns.metadata))} as metadata`
        : sql`NULL as metadata`
    ];

    // Determine sort order
    const [sortCol, sortDir] = sort.split('_');
    const orderDirection = sortDir === "asc" ? sql`ASC` : sql`DESC`;
    
    let orderColumn = sql`timestamp`;
    switch (sortCol) {
      case 'event': orderColumn = sql`event`; break;
      case 'actorEmail': orderColumn = sql`"actorEmail"`; break;
      case 'entityType': orderColumn = sql`"entityType"`; break;
      case 'ipAddress': orderColumn = sql`"ipAddress"`; break;
      case 'userAgent': orderColumn = sql`"userAgent"`; break;
      case 'status': orderColumn = sql`status`; break;
    }
    const orderBy = sql`ORDER BY ${orderColumn} ${orderDirection} NULLS LAST`;

    const dataQuery = sql`
      SELECT ${sql.join(selectColumns, sql`, `)}
      FROM ${sql.raw(this.tableName)}
      LEFT JOIN users ON ${sql.raw(this.tableName)}.${sql.raw(this.columns.actorId ?? "user_id")} = users.id
      ${whereClause}
      ${orderBy}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const dataResult = await database.execute(dataQuery);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const rows = dataResult.rows as ActivityLog[];

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, sonarjs/no-unused-collection
    const values: any[] = []; // Dynamic values for raw SQL INSERT
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const placeholders: any[] = []; // Dynamic placeholders for Drizzle SQL builder

    // Helper to add a column if it exists in config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addColumn = (configKey: keyof typeof this.columns, value: any): void => { // Dynamic value for EAV-style data // Dynamic value for EAV-style data
      const columnName = this.columns[configKey];
      if (value === undefined || !columnName) {return;}

      columns.push(columnName);
      values.push(value);
      placeholders.push(sql`${value}`);
    };

    // Map fields to columns
    addColumn("id", entry.id ?? sql`gen_random_uuid()`);
    addColumn("timestamp", entry.timestamp ?? new Date().toISOString());
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
      VALUES (${// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      sql.join(placeholders, sql`, `)})
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

    const result = await database.execute(query) as RawRowsResult;
    return result.rows
      .map((row) => row.event)
      .filter((event): event is string => typeof event === "string");
  }

  /**
   * Get unique actors (for filter dropdowns)
   */
  async getUniqueActors(tx?: DbTransaction): Promise<string[]> {
    const database = this.getDb(tx);

    // Try actorEmail first, fallback to actorId
    const actorColumn = this.columns.actorEmail ?? this.columns.actorId;
    if (actorColumn === null || actorColumn === undefined) {return [];}

    const query = sql`
      SELECT DISTINCT ${sql.raw(actorColumn)} as actor
      FROM ${sql.raw(this.tableName)}
      WHERE ${sql.raw(actorColumn)} IS NOT NULL
      ORDER BY ${sql.raw(actorColumn)}
      LIMIT 100
    `;

    const result = await database.execute(query) as RawRowsResult;
    return result.rows
      .map((row) => row.actor)
      .filter((actor): actor is string => typeof actor === "string");
  }
}
