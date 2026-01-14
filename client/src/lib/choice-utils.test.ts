import { describe, it, expect } from 'vitest';

import { generateOptionsFromList } from "./choice-utils";

import type { DynamicOptionsConfig } from "@/../../shared/types/stepConfigs";

describe("choice-utils", () => {
    const mockList = {
        metadata: { sourceId: "table1" },
        count: 3,
        columns: [
            { id: "col1", name: "Name", type: "text" },
            { id: "col2", name: "Email", type: "text" },
            { id: "col3", name: "Role", type: "text" },
            { id: "col4", name: "Age", type: "number" }
        ],
        rows: [
            { id: "row1", col1: "Alice", col2: "alice@example.com", col3: "Admin", col4: 30 },
            { id: "row2", col1: "Bob", col2: "bob@example.com", col3: "User", col4: 25 },
            { id: "row3", col1: "Charlie", col2: "charlie@example.com", col3: "User", col4: 35 }
        ]
    };

    const duplicateList = {
        ...mockList,
        rows: [
            ...mockList.rows,
            { id: "row4", col1: "Alice", col2: "alice2@example.com", col3: "Guest", col4: 20 }, // Duplicate Name
            { id: "row5", col1: "David", col2: "david@example.com", col3: "User", col4: 25 } // Duplicate Age
        ]
    };

    it("generates options with basic mapping", () => {
        const config: DynamicOptionsConfig = {
            type: "list",
            listVariable: "users",
            labelPath: "col1",
            valuePath: "id"
        };
        const opts = generateOptionsFromList(mockList, config);
        expect(opts).toHaveLength(3);
        expect(opts[0]).toEqual({ id: "row1", label: "Alice", alias: "row1" });
        expect(opts[1]).toEqual({ id: "row2", label: "Bob", alias: "row2" });
    });

    it("sorts by label asc", () => {
        const config: DynamicOptionsConfig = {
            type: "list",
            listVariable: "users",
            labelPath: "col1",
            valuePath: "id",
            transform: {
                sort: [{ fieldPath: "col1", direction: "asc" }]
            }
        };
        const opts = generateOptionsFromList(mockList, config);
        expect(opts.map(o => o.label)).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("sorts by label desc", () => {
        const config: DynamicOptionsConfig = {
            type: "list",
            listVariable: "users",
            labelPath: "col1",
            valuePath: "id",
            transform: {
                sort: [{ fieldPath: "col1", direction: "desc" }]
            }
        };
        const opts = generateOptionsFromList(mockList, config);
        expect(opts.map(o => o.label)).toEqual(["Charlie", "Bob", "Alice"]);
    });

    it("dedupes by label", () => {
        const config: DynamicOptionsConfig = {
            type: "list",
            listVariable: "users",
            labelPath: "col1", // Name
            valuePath: "id",
            transform: {
                dedupe: { fieldPath: "col1" } // Should remove duplicates of "Alice" if any (Alice appears twice in duplicateList)
            }
        };
        const opts = generateOptionsFromList(duplicateList, config);
        // duplicateList has two Alices.
        const alices = opts.filter(o => o.label === "Alice");
        expect(alices).toHaveLength(1);
    });

    it("dedupes by value (alias)", () => {
        // Mock list where valuePath produces dupes
        const config: DynamicOptionsConfig = {
            type: "list",
            listVariable: "users",
            labelPath: "col1",
            valuePath: "col3", // Role (Admin, User, User)
            transform: {
                dedupe: { fieldPath: "col3" }
            }
        };
        const opts = generateOptionsFromList(mockList, config);
        // Roles: Admin, User, User - should be Admin, User
        expect(opts).toHaveLength(2);
        expect(opts.map(o => o.alias)).toContain("Admin");
        expect(opts.map(o => o.alias)).toContain("User");
    });

    it("uses label template with column names", () => {
        const config: DynamicOptionsConfig = {
            type: "list",
            listVariable: "users",
            labelPath: "col1",
            valuePath: "id",
            labelTemplate: "{Name} ({Role})"
        };
        const opts = generateOptionsFromList(mockList, config);
        expect(opts[0].label).toBe("Alice (Admin)");
        expect(opts[1].label).toBe("Bob (User)");
    });

    it("handles missing content gracefully", () => {
        const config: DynamicOptionsConfig = {
            type: "list",
            listVariable: "users",
            labelPath: "col1",
            valuePath: "id"
        };
        expect(generateOptionsFromList(null, config)).toEqual([]);
        expect(generateOptionsFromList([], config)).toEqual([]);
    });
});
