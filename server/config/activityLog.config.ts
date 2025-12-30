/**
 * Activity Log Configuration
 *
 * Maps logical activity log fields to actual database columns.
 * Default configuration uses the existing analyticsEvents table.
 *
 * To use a different table (e.g., a dedicated activity_logs table):
 * 1. Update the `table` property
 * 2. Map the columns to match your schema
 * 3. Set any unavailable columns to null
 */

export const activityLogSource = {
  table: "audit_logs",
  columns: {
    id: "id",
    timestamp: "timestamp",
    event: "action",             // audit_logs.action
    actorId: "user_id",          // audit_logs.user_id
    actorEmail: null,            // Not available directly in audit_logs
    entityType: "resource_type", // audit_logs.resource_type
    entityId: "resource_id",     // audit_logs.resource_id
    status: null,                // Not available in audit_logs
    ipAddress: "ip_address",     // audit_logs.ip_address
    userAgent: "user_agent",     // audit_logs.user_agent
    metadata: "changes"          // audit_logs.changes
  }
} as const;

/**
 * Event Display Configuration
 *
 * Maps event names to human-friendly labels and visual styling.
 * Add new events here as they're introduced to your application.
 */
export const eventDisplayMap: Record<string, { label: string; tone: "info" | "success" | "warn" | "error" }> = {
  // Survey lifecycle events
  "survey_start": { label: "Survey Started", tone: "info" },
  "survey_complete": { label: "Survey Completed", tone: "success" },
  "survey_abandon": { label: "Survey Abandoned", tone: "warn" },

  // Page navigation events
  "page_view": { label: "Page Viewed", tone: "info" },
  "page_leave": { label: "Page Left", tone: "info" },

  // Question interaction events
  "question_focus": { label: "Question Focused", tone: "info" },
  "question_blur": { label: "Question Blurred", tone: "info" },
  "question_answer": { label: "Question Answered", tone: "success" },
  "question_skip": { label: "Question Skipped", tone: "warn" },

  // AI-related events (if you're tracking AI survey generation)
  "ai.generated": { label: "AI Survey Generated", tone: "success" },
  "ai.error": { label: "AI Generation Failed", tone: "error" },

  // Admin / Security Events
  "login_success": { label: "Login Success", tone: "success" },
  "login_failed": { label: "Login Failed", tone: "error" },
  "user.create": { label: "User Created", tone: "success" },
  "user.update": { label: "User Updated", tone: "info" },
  "user.delete": { label: "User Deleted", tone: "warn" },
  "workflow.delete": { label: "Workflow Deleted", tone: "warn" },
};

/**
 * Get display info for an event, with fallback for unknown events
 */
export function getEventDisplay(eventName: string): { label: string; tone: "info" | "success" | "warn" | "error" } {
  return eventDisplayMap[eventName] ?? {
    label: eventName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    tone: "info"
  };
}
