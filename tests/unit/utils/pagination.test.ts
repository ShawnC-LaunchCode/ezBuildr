import { describe, it, expect } from "vitest";

import {
  paginationQuerySchema,
  createPaginatedResponse,
  encodeCursor,
  decodeCursor,
  buildCursorWhere,
} from "../../../server/utils/pagination";

describe("Pagination Utilities", () => {
  describe("paginationQuerySchema", () => {
    it("should parse valid pagination query with defaults", () => {
      const result = paginationQuerySchema.parse({});

      expect(result.limit).toBe(20);
      expect(result.cursor).toBeUndefined();
    });

    it("should parse custom limit", () => {
      const result = paginationQuerySchema.parse({ limit: 50 });

      expect(result.limit).toBe(50);
    });

    it("should coerce limit to number", () => {
      const result = paginationQuerySchema.parse({ limit: "50" });

      expect(result.limit).toBe(50);
      expect(typeof result.limit).toBe("number");
    });

    it("should parse cursor", () => {
      const result = paginationQuerySchema.parse({ cursor: "abc123" });

      expect(result.cursor).toBe("abc123");
    });

    it("should enforce minimum limit of 1", () => {
      expect(() => paginationQuerySchema.parse({ limit: 0 })).toThrow();
      expect(() => paginationQuerySchema.parse({ limit: -5 })).toThrow();
    });

    it("should enforce maximum limit of 100", () => {
      expect(() => paginationQuerySchema.parse({ limit: 101 })).toThrow();
      expect(() => paginationQuerySchema.parse({ limit: 1000 })).toThrow();
    });

    it("should enforce integer limit", () => {
      expect(() => paginationQuerySchema.parse({ limit: 10.5 })).toThrow();
    });
  });

  describe("encodeCursor and decodeCursor", () => {
    it("should encode and decode cursor correctly", () => {
      const item = {
        id: "workflow-123",
        createdAt: new Date("2025-01-15T10:00:00Z"),
      };

      const cursor = encodeCursor(item);
      const decoded = decodeCursor(cursor);

      expect(decoded).not.toBeNull();
      expect(decoded?.id).toBe("workflow-123");
      expect(decoded?.timestamp).toBe(new Date("2025-01-15T10:00:00Z").getTime());
    });

    it("should handle null createdAt by using current time", () => {
      const item = {
        id: "workflow-123",
        createdAt: null,
      };

      const beforeEncode = Date.now();
      const cursor = encodeCursor(item);
      const afterEncode = Date.now();
      const decoded = decodeCursor(cursor);

      expect(decoded).not.toBeNull();
      expect(decoded?.id).toBe("workflow-123");
      expect(decoded?.timestamp).toBeGreaterThanOrEqual(beforeEncode);
      expect(decoded?.timestamp).toBeLessThanOrEqual(afterEncode);
    });

    it("should encode cursor as base64", () => {
      const item = {
        id: "workflow-123",
        createdAt: new Date("2025-01-15T10:00:00Z"),
      };

      const cursor = encodeCursor(item);

      // Should be valid base64
      expect(() => Buffer.from(cursor, "base64")).not.toThrow();
    });

    it("should return null for invalid base64 cursor", () => {
      const decoded = decodeCursor("not-valid-base64!!!!");

      expect(decoded).toBeNull();
    });

    it("should return null for malformed cursor payload", () => {
      // Valid base64 but invalid payload format
      const invalidPayload = Buffer.from("just-one-part").toString("base64");
      const decoded = decodeCursor(invalidPayload);

      expect(decoded).toBeNull();
    });

    it("should return null for cursor with non-numeric timestamp", () => {
      const invalidPayload = Buffer.from("id-123:not-a-number").toString("base64");
      const decoded = decodeCursor(invalidPayload);

      expect(decoded).toBeNull();
    });

    it("should handle cursor with special characters in ID", () => {
      const item = {
        id: "workflow-123-abc_xyz",
        createdAt: new Date("2025-01-15T10:00:00Z"),
      };

      const cursor = encodeCursor(item);
      const decoded = decodeCursor(cursor);

      expect(decoded?.id).toBe("workflow-123-abc_xyz");
    });
  });

  describe("createPaginatedResponse", () => {
    const createMockItems = (count: number) => {
      return Array.from({ length: count }, (_, i) => ({
        id: `item-${i + 1}`,
        title: `Item ${i + 1}`,
        createdAt: new Date(Date.now() - i * 1000),
      }));
    };

    it("should create paginated response with hasMore=false when items <= limit", () => {
      const items = createMockItems(10);
      const limit = 20;

      const result = createPaginatedResponse(items, limit);

      expect(result.items).toHaveLength(10);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("should create paginated response with hasMore=true when items > limit", () => {
      const items = createMockItems(25);
      const limit = 20;

      const result = createPaginatedResponse(items, limit);

      expect(result.items).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it("should encode nextCursor based on last returned item", () => {
      const items = createMockItems(25);
      const limit = 20;

      const result = createPaginatedResponse(items, limit);

      // Last returned item should be item-20
      const lastItem = result.items[result.items.length - 1];
      expect(lastItem.id).toBe("item-20");

      // Decode cursor and verify it matches last item
      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded?.id).toBe("item-20");
    });

    it("should handle exact match (items === limit + 1)", () => {
      const items = createMockItems(21);
      const limit = 20;

      const result = createPaginatedResponse(items, limit);

      expect(result.items).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it("should handle empty items array", () => {
      const items = createMockItems(0);
      const limit = 20;

      const result = createPaginatedResponse(items, limit);

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("should handle single item", () => {
      const items = createMockItems(1);
      const limit = 20;

      const result = createPaginatedResponse(items, limit);

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe("buildCursorWhere", () => {
    it("should return null for undefined cursor", () => {
      const result = buildCursorWhere(undefined);

      expect(result).toBeNull();
    });

    it("should build where clause from valid cursor", () => {
      const item = {
        id: "workflow-123",
        createdAt: new Date("2025-01-15T10:00:00Z"),
      };

      const cursor = encodeCursor(item);
      const result = buildCursorWhere(cursor);

      expect(result).not.toBeNull();
      expect(result?.id).toBe("workflow-123");
      expect(result?.timestamp).toEqual(new Date("2025-01-15T10:00:00Z"));
    });

    it("should return null for invalid cursor", () => {
      const result = buildCursorWhere("invalid-cursor");

      expect(result).toBeNull();
    });

    it("should handle empty string cursor", () => {
      const result = buildCursorWhere("");

      expect(result).toBeNull();
    });
  });
});
