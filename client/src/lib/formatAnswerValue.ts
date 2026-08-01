/**
 * Formats a collected answer value for read-only display. Shared by
 * ReviewSection.tsx (top-level step answers) and ListAnswerView.tsx (field
 * values inside a List item) so the two surfaces can't grow independent
 * formatting rules.
 */
export function formatAnswerValue(val: unknown): string {
  if (val === null || val === undefined || val === "") {
    return "Not answered";
  }
  if (typeof val === "boolean") {
    return val ? "Yes" : "No";
  }
  if (val instanceof Date) {
    return val.toLocaleDateString();
  }
  if (Array.isArray(val)) {
    return val.join(", ");
  }
  if (typeof val === "object") {
    return JSON.stringify(val);
  }
  return String(val);
}
