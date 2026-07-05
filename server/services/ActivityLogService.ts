import { ActivityLogRepository } from "../repositories/ActivityLogRepository";
import { ActivityLogQuery, ActivityLogInsert, ActivityLogResult } from "../types/activityLog";

/**
 * Activity Log Service
 *
 * Provides business logic for activity log operations including:
 * - Querying and filtering logs
 * - Exporting logs to CSV
 * - Manual log creation (optional)
 */
export class ActivityLogService {
  constructor(private repo = new ActivityLogRepository()) { }

  /**
   * List activity logs with filtering, pagination, and sorting
   */
  async list(query: ActivityLogQuery): Promise<ActivityLogResult> {
    return this.repo.find(query);
  }

  /**
   * Export activity logs to CSV format
   *
   * @param query - Filter criteria (same as list)
   * @returns Object with filename and CSV content
   */
  async exportCsv(query: ActivityLogQuery): Promise<{ filename: string; csv: string }> {
    // Get all matching rows (with a reasonable limit for export)
    const exportQuery = {
      ...query,
      limit: query.limit ?? 5000,  // Default export limit
      offset: 0                     // Always start from beginning for export
    };

    const { rows } = await this.repo.find(exportQuery);

    // Define CSV headers
    const headers = [
      "timestamp",
      "event",
      "actorId",
      "actorEmail",
      "entityType",
      "entityId",
      "status",
      "ipAddress",
      "userAgent",
      "metadata"
    ];

    // Helper to escape CSV values
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CSV escaping handles various value types
    const escapeCsv = (value: any): string => {
      if (value === null || value === undefined) { return ""; }

      // Convert objects/arrays to JSON strings
      let stringValue: string;
      if (typeof value === "object") {
        stringValue = JSON.stringify(value);
      } else {
        stringValue = String(value);
      }

      // Escape double quotes and wrap in quotes if contains special chars
      if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }

      return stringValue;
    };

    // Build CSV rows
    const csvRows = [
      // Header row
      headers.join(","),
      // Data rows
      ...rows.map(row =>
        headers
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- dynamic row access for CSV export
          .map(header => escapeCsv((row as any)[header]))
          .join(",")
      )
    ];

    const csv = csvRows.join("\n");

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `activity-logs-${timestamp}.csv`;

    return { filename, csv };
  }

  /**
   * Manually log an activity event
   *
   * Optional method - use this to record custom events that aren't
   * automatically tracked by your analytics system.
   *
   * @param event - Event name/type
   * @param details - Additional event details
   */
  async log(
    event: string,
    details?: Partial<{
      actorId: string | null;
      actorEmail: string | null;
      entityType: string | null;
      entityId: string | null;
      status: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- metadata is dynamic JSON content
      metadata: any;
    }>
  ): Promise<void> {
    // Since actorEmail might not have a dedicated column, inject it into metadata
    const enhancedMetadata = {
      ...details?.metadata,
      _actorEmail: details?.actorEmail ?? undefined
    };

    const entry: ActivityLogInsert = {
      event,
      timestamp: new Date().toISOString(),
      actorId: details?.actorId ?? null,
      actorEmail: details?.actorEmail ?? null,
      entityType: details?.entityType ?? null,
      entityId: details?.entityId ?? null,
      status: details?.status ?? "info",
      ipAddress: details?.ipAddress ?? null,
      userAgent: details?.userAgent ?? null,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      metadata: Object.keys(enhancedMetadata).length > 0 ? enhancedMetadata : null
    };

    await this.repo.insert(entry);
  }

  /**
   * Get unique event types for filter dropdowns
   */
  async getUniqueEvents(): Promise<string[]> {
    return this.repo.getUniqueEvents();
  }

  /**
   * Get unique actors for filter dropdowns
   */
  async getUniqueActors(): Promise<string[]> {
    return this.repo.getUniqueActors();
  }
}
