import { WriteRunner } from "../../../server/lib/writes/WriteRunner";
import { datavaultRowsRepository, datavaultColumnsRepository, datavaultTablesRepository } from "../../../server/repositories";
import { datavaultTablesService } from "../../../server/services/DatavaultTablesService";
import { datavaultRowsService } from "../../../server/services/DatavaultRowsService";
import type { WriteBlockConfig, BlockContext } from "@shared/types/blocks";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
vi.mock("../../../server/db", () => ({
    db: {
        transaction: vi.fn((callback) => callback({})), // Execute transaction callback immediately
    },
    initializeDatabase: vi.fn(),
    dbInitPromise: Promise.resolve(),
}));

// Mock repositories
vi.mock("../../../server/repositories", () => ({
    datavaultRowsRepository: {
        createRowWithValues: vi.fn(),
        updateRowValues: vi.fn(),
        findRowByColumnValue: vi.fn(),
        findById: vi.fn(),
    },
    datavaultColumnsRepository: {
        findByTableId: vi.fn(),
    },
    datavaultTablePermissionsRepository: {
        findByTableAndUser: vi.fn(),
    },
    datavaultTablesRepository: {
        findById: vi.fn(),
    },
}));

vi.mock("../../../server/services/DatavaultTablesService", () => ({
    datavaultTablesService: {
        verifyTenantOwnership: vi.fn().mockResolvedValue(true),
    }
}));

vi.mock("../../../server/services/DatavaultRowsService", () => ({
    datavaultRowsService: {
        createRow: vi.fn().mockResolvedValue({ row: { id: "row-new" }, values: [] }),
        updateRow: vi.fn().mockResolvedValue({}),
    }
}));

describe("WriteRunner", () => {
    let runner: WriteRunner;
    const mockTenantId = "tenant-123";
    const mockContext: BlockContext = {
        workflowId: "wf-1",
        runId: "run-1",
        phase: "onNext",
        sectionId: "sec-1",
        data: {
            firstName: "John",
            lastName: "Doe",
            age: 30,
            userParams: {
                id: "u-1"
            }
        }
    };

    beforeEach(() => {
        runner = new WriteRunner();
        vi.clearAllMocks();

        // Default mocks
        (datavaultColumnsRepository.findByTableId as any).mockResolvedValue([
            { id: "col-first", type: "text", required: false, name: "First Name" },
            { id: "col-last", type: "text", required: false, name: "Last Name" },
            { id: "col-age", type: "number", required: false, name: "Age" },
            { id: "col-email", type: "email", required: false, name: "Email" }, // Added for Update test
            { id: "col-status", type: "text", required: false, name: "Status" }
        ]);
        (datavaultTablesRepository.findById as any).mockResolvedValue({
            id: "table-users",
            tenantId: mockTenantId
        });
        (datavaultRowsRepository.findById as any).mockResolvedValue({
            id: "row-existing-1",
            tableId: "table-users",
        });
    });

    describe("Mode: Create", () => {
        beforeEach(() => {
            // Specific overrides if needed
        });

        it("should resolve values and call createRowWithValues", async () => {
            const config: any = {
                id: "block-1",
                workflowId: "wf-1",
                type: "write",
                phase: "onNext",
                tableId: "table-users",
                mode: "create",
                columnMappings: [
                    { columnId: "col-first", value: "{{ firstName }}" },
                    { columnId: "col-last", value: "Doe" }, // Static
                    { columnId: "col-age", value: "{{ age }}" }
                ],
                enabled: true,
                order: 0,
                config: {} // Schema requires config prop? No, WriteBlockConfig IS the config in Schema json? 
                // Wait, shared/types/blocks struct might differ from DB schema usage in BlockRunner.
                // In BlockRunner: `block.config as WriteBlockConfig`. 
                // So WriteBlockConfig is the INNER config object.
            };
            // Correcting config shape for the test based on BlockRunner usage

            const writeConfig: WriteBlockConfig = {
                tableId: "table-users",
                dataSourceId: "ds-native",
                mode: "create",
                columnMappings: [
                    { columnId: "col-first", value: "{{ firstName }}" },
                    { columnId: "col-last", value: "Doe" },
                    { columnId: "col-age", value: "{{ age }}" }
                ]
            };

            (datavaultRowsRepository.createRowWithValues as any).mockResolvedValue({
                row: { id: "row-new" },
                values: []
            });

            const result = await runner.executeWrite(writeConfig, mockContext, mockTenantId);

            expect(result.success).toBe(true);
            expect(result.rowId).toBe("row-new");

            // Verify repository call
            const expectedValues = [
                { columnId: "col-first", value: "John" },
                { columnId: "col-last", value: "Doe" },
                { columnId: "col-age", value: 30 }
            ];
            expect(datavaultRowsRepository.createRowWithValues).toHaveBeenCalledWith(
                expect.objectContaining({ tableId: "table-users", tenantId: mockTenantId }),
                expect.arrayContaining([
                    expect.objectContaining({ columnId: "col-first", value: "John" }),
                    expect.objectContaining({ columnId: "col-age", value: 30 })
                ])
            );
        });

        it("should simulate write in preview mode", async () => {
            const writeConfig: WriteBlockConfig = {
                tableId: "table-users",
                dataSourceId: "ds-native",
                mode: "create",
                columnMappings: []
            };

            const result = await runner.executeWrite(writeConfig, mockContext, mockTenantId, true); // isPreview=true

            expect(result.success).toBe(true);
            expect(result.rowId).toBe("preview-simulated-id");
            expect(datavaultRowsRepository.createRowWithValues).not.toHaveBeenCalled();
        });
    });

    describe("Mode: Update", () => {
        it("should find row by PK and update", async () => {
            const writeConfig: WriteBlockConfig = {
                tableId: "table-users",
                dataSourceId: "ds-native",
                mode: "update",
                primaryKeyColumnId: "col-email",
                primaryKeyValue: "test@example.com", // Static for simplicity or path?
                columnMappings: [
                    { columnId: "col-status", value: "Active" }
                ]
            };

            (datavaultRowsRepository.findRowByColumnValue as any).mockResolvedValue("row-existing-1");
            (datavaultRowsRepository.updateRowValues as any).mockResolvedValue(true);

            const result = await runner.executeWrite(writeConfig, mockContext, mockTenantId);

            expect(result.success).toBe(true);
            expect(result.rowId).toBe("row-existing-1");

            expect(datavaultRowsRepository.findRowByColumnValue).toHaveBeenCalledWith(
                "table-users", "col-email", "test@example.com", mockTenantId, expect.anything(), false
            );
            expect(datavaultRowsRepository.updateRowValues).toHaveBeenCalledWith(
                "row-existing-1",
                [{ columnId: "col-status", value: "Active" }]
            );
        });

        it("should return failure result if row not found", async () => {
            const writeConfig: WriteBlockConfig = {
                tableId: "table-users",
                dataSourceId: "ds-native",
                mode: "update",
                primaryKeyColumnId: "col-email",
                primaryKeyValue: "missing@example.com",
                columnMappings: []
            };


            (datavaultTablesRepository.findById as any).mockResolvedValue({
                id: "table-users",
                tenantId: mockTenantId
            });
            (datavaultRowsRepository.findRowByColumnValue as any).mockResolvedValue(null);

            const result = await runner.executeWrite(writeConfig, mockContext, mockTenantId);

            expect(result.success).toBe(false);
            expect(result.error).toContain("Row not found");
        });
    });
});
