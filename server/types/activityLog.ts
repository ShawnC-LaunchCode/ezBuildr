/**
 * Activity Log Types
 *
 * Schema-agnostic type definitions for activity log queries and records.
 * These types are independent of the underlying database table structure.
 */

/**
 * A single activity log entry with all possible fields.
 * Fields may be null depending on the underlying table schema.
 */
export type ActivityLog = {
  id: string;
  timestamp: string;              // ISO 8601 timestamp
  event: string;                  // Event type/name
  actorId?: string | null;        // ID of the user/entity that performed the action
  actorEmail?: string | null;     // Email of the actor (if available)
  entityType?: string | null;     // Type of entity being acted upon (e.g., "survey", "question")
  entityId?: string | null;       // ID of the entity being acted upon
  status?: string | null;         // Event status: "success", "error", "info", "warn"
  ipAddress?: string | null;      // IP address of the actor
  userAgent?: string | null;      // Browser/client user agent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;                 // Additional event-specific data (JSON)
};

/**
 * Query parameters for filtering and paginating activity logs
 */
export type ActivityLogQuery = {
  // Text search
  q?: string;                     // Free-text search across event, email, entity

  // Specific filters
  event?: string;                 // Filter by event type
  actor?: string;                 // Filter by actor email or ID
  entityType?: string;            // Filter by entity type
  entityId?: string;              // Filter by specific entity ID
  status?: string;                // Filter by status (success/error/info/warn)

  // Date range
  from?: string;                  // Start date (ISO format or YYYY-MM-DD)
  to?: string;                    // End date (ISO format or YYYY-MM-DD)

  // Pagination
  limit?: number;                 // Number of results per page (default: 50)
  offset?: number;                // Pagination offset (default: 0)

  // Sorting
  sort?: string;  // Sort order (default: timestamp_desc)
};

/**
 * Result of a paginated activity log query
 */
export type ActivityLogResult = {
  rows: ActivityLog[];            // The activity log entries
  total: number;                  // Total number of matching entries (for pagination)
};

/**
 * Parameters for inserting a new activity log entry
 * All fields except `event` are optional
 */
export type ActivityLogInsert = {
  id?: string;                    // Auto-generated if not provided
  timestamp?: string;             // Defaults to current time if not provided
  event: string;                  // Required: event type/name
  actorId?: string | null;
  actorEmail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  status?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
};
