import { z } from "zod";

// =====================================================================
// Query Definition Types
// =====================================================================

export const queryOperatorSchema = z.enum([
    "=", "!=",
    ">", ">=", "<", "<=",
    "contains", "startsWith", "endsWith",
    "in", "is_empty", "is_not_empty"
]);

export type QueryOperator = z.infer<typeof queryOperatorSchema>;

export const queryFilterSchema = z.object({
    id: z.string().uuid().optional(), // For UI keys
    columnId: z.string().uuid(),
    operator: queryOperatorSchema,
    value: z.any().optional(), // Can be static value or variable reference string
});

export type QueryFilter = z.infer<typeof queryFilterSchema>;

export const querySortSchema = z.object({
    columnId: z.string().uuid(),
    direction: z.enum(["asc", "desc"]),
});

export type QuerySort = z.infer<typeof querySortSchema>;

export const workflowQuerySchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    workflowId: z.string().uuid(),
    dataSourceId: z.string().uuid(),
    tableId: z.string().uuid(),
    filters: z.array(queryFilterSchema).default([]),
    sort: z.array(querySortSchema).default([]),
    limit: z.number().int().min(1).max(1000).optional(),
});

export type WorkflowQuery = z.infer<typeof workflowQuerySchema>;

// =====================================================================
// Runtime List Variable Interface
// =====================================================================

export interface ListVariable<T = Record<string, any>> {
    id: string; // Query ID
    name: string; // Query Name (variable name)
    tableId: string;
    rows: T[]; // Array of row objects (keyed by columnId usually)
    rowCount: number;
    columnIds: string[]; // Metadata: columns available in this list

    // Helpers (runtime only, not serialized to DB)
    // These would be attached by the runtime engine wrapper
    // getColumn?: (columnId: string) => any[]; 
}
