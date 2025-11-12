import { z } from 'zod';

/**
 * Pagination query parameters schema
 */
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Create paginated response
 */
export function createPaginatedResponse<T extends { id: string; createdAt: Date | null }>(
  items: T[],
  limit: number
): PaginatedResponse<T> {
  const hasMore = items.length > limit;
  const responseItems = hasMore ? items.slice(0, limit) : items;

  const nextCursor = hasMore && responseItems.length > 0
    ? encodeCursor(responseItems[responseItems.length - 1])
    : null;

  return {
    items: responseItems,
    nextCursor,
    hasMore,
  };
}

/**
 * Cursor encoding/decoding
 * Format: base64(id:timestamp)
 */
export function encodeCursor(item: { id: string; createdAt: Date | null }): string {
  const timestamp = item.createdAt?.getTime() || Date.now();
  const payload = `${item.id}:${timestamp}`;
  return Buffer.from(payload).toString('base64');
}

export function decodeCursor(cursor: string): { id: string; timestamp: number } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const [id, timestampStr] = decoded.split(':');
    const timestamp = parseInt(timestampStr, 10);

    if (!id || isNaN(timestamp)) {
      return null;
    }

    return { id, timestamp };
  } catch {
    return null;
  }
}

/**
 * Build WHERE clause for cursor pagination
 * This uses a composite index on (createdAt, id) for efficient pagination
 */
export function buildCursorWhere(cursor: string | undefined): { timestamp?: Date; id?: string } | null {
  if (!cursor) {
    return null;
  }

  const decoded = decodeCursor(cursor);
  if (!decoded) {
    return null;
  }

  return {
    timestamp: new Date(decoded.timestamp),
    id: decoded.id,
  };
}
