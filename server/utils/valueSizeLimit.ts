import { AppError } from "../middleware/errorHandler";

/**
 * Shared per-value byte cap for user-submitted JSONB (workflow step values and
 * DataVault cell values). Sits under the global ~10MB request body limit and
 * caps any single field so one value can't be bloated (SEC-122).
 *
 * 1MB is generous enough for signature/base64 data URIs and long text answers
 * while still bounding abuse. Override with MAX_STEP_VALUE_BYTES.
 */
export const MAX_VALUE_BYTES = Number(process.env.MAX_STEP_VALUE_BYTES ?? 1024 * 1024);

/** UTF-8 byte size of a value once serialized to JSON. */
export function getValueByteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

/** True when the value's serialized size exceeds the cap. */
export function exceedsValueSizeLimit(value: unknown): boolean {
  return getValueByteSize(value) > MAX_VALUE_BYTES;
}

/**
 * Throw a 413 AppError when a single value exceeds the cap.
 * `label` is used in the message, e.g. "Answer for step abc" or "Column 'x' value".
 */
export function assertValueSizeWithinLimit(value: unknown, label: string): void {
  const bytes = getValueByteSize(value);
  if (bytes > MAX_VALUE_BYTES) {
    throw new AppError(
      `${label} is too large (${bytes} bytes; limit ${MAX_VALUE_BYTES} bytes).`,
      413
    );
  }
}

/** Throw a 413 AppError for the first oversize step value in a batch. */
export function assertStepValueSizesWithinLimit(
  items: { stepId: string; value: unknown }[]
): void {
  for (const { stepId, value } of items) {
    assertValueSizeWithinLimit(value, `Answer for step ${stepId}`);
  }
}
