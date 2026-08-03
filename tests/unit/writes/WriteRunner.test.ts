
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { WriteBlockConfig, BlockContext } from "@shared/types/blocks";

import type { DatavaultColumn, DatavaultRow, DatavaultTable } from "@shared/schema";
import { ConflictError } from "../../../server/errors/AppError";
import { AuditLogger } from "../../../server/lib/audit/auditLogger";
import { WriteRunner } from "../../../server/lib/writes/WriteRunner";
import { datavaultRowsRepository, datavaultColumnsRepository, datavaultTablesRepository } from "../../../server/repositories";
import { datavaultRowsService } from "../../../server/services/DatavaultRowsService";

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    info: vi.fn(),
}));

vi.mock("../../../server/logger", () => ({
    createLogger: vi.fn(() => mockLogger),
}));
vi.mock("../../../server/lib/audit/auditLogger", () => ({
    AuditLogger: {
        log: vi.fn().mockResolvedValue(undefined),
    },
}));
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
        },
        userId: "u-1"
    };
    beforeEach(() => {
        runner = new WriteRunner();
        vi.clearAllMocks();
        vi.mocked(datavaultRowsService.createRow).mockResolvedValue({
            row: { id: "row-new" } as DatavaultRow,
            values: {},
        });
        vi.mocked(datavaultRowsService.updateRow).mockResolvedValue(undefined);
        // Default mocks
        vi.mocked(datavaultColumnsRepository.findByTableId).mockResolvedValue([
            { id: "col-first", type: "text", required: false, name: "First Name" },
            { id: "col-last", type: "text", required: false, name: "Last Name" },
            { id: "col-age", type: "number", required: false, name: "Age" },
            { id: "col-email", type: "email", required: false, name: "Email" }, // Added for Update test
            { id: "col-status", type: "text", required: false, name: "Status" }
        ] as unknown as DatavaultColumn[]);
        vi.mocked(datavaultTablesRepository.findById).mockResolvedValue({
            id: "table-users",
            tenantId: mockTenantId
        } as unknown as DatavaultTable);
        vi.mocked(datavaultRowsRepository.findById).mockResolvedValue({
            id: "row-existing-1",
            tableId: "table-users",
        } as unknown as DatavaultRow);
    });
    describe("Mode: Create", () => {
        beforeEach(() => {
            // Specific overrides if needed
        });
        it("should resolve values and call datavaultRowsService.createRow", async () => {
            // Note: _config is unused in the test logic below, we define writeConfig properly.
            // Keeping it for reference or removing if purely unused.
            // It seems the test meant to use it or it's legacy. 
            // The original code typed it as `any`. usage: none visible except maybe compilation.
            // I'll assume it's a Partial<WriteBlockConfig> or just remove the explicit type if it's just a mock object.

            const _config = {
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
            vi.mocked(datavaultRowsRepository.createRowWithValues).mockResolvedValue({
                row: { id: "row-new" } as DatavaultRow,
                values: []
            });
            const result = await runner.executeWrite(writeConfig, mockContext, mockTenantId);
            expect(result.success).toBe(true);
            expect(result.rowId).toBe("row-new");
            // Verify repository call
            const _expectedValues = [
                { columnId: "col-first", value: "John" },
                { columnId: "col-last", value: "Doe" },
                { columnId: "col-age", value: 30 }
            ];
            expect(datavaultRowsService.createRow).toHaveBeenCalledWith(
                "table-users",
                mockTenantId,
                expect.objectContaining({
                    "col-first": "John",
                    "col-last": "Doe",
                    "col-age": 30
                }),
                mockContext.data.userParams.id, // userId
                expect.anything() // tx
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
            expect(datavaultRowsService.createRow).not.toHaveBeenCalled();
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
            vi.mocked(datavaultRowsRepository.findRowByColumnValue).mockResolvedValue("row-existing-1");
            vi.mocked(datavaultRowsRepository.updateRowValues).mockResolvedValue(undefined);
            const result = await runner.executeWrite(writeConfig, mockContext, mockTenantId);
            expect(result.success).toBe(true);
            expect(result.rowId).toBe("row-existing-1");
            expect(datavaultRowsRepository.findRowByColumnValue).toHaveBeenCalledWith(
                "table-users", "col-email", "test@example.com", expect.objectContaining({ tenantId: mockTenantId, forUpdate: false })
            );
            // Then calls service execution
            expect(datavaultRowsService.updateRow).toHaveBeenCalledWith(
                "row-existing-1",
                mockTenantId,
                expect.objectContaining({ "col-status": "Active" }),
                mockContext.data.userParams.id,
                expect.anything()
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
            vi.mocked(datavaultTablesRepository.findById).mockResolvedValue({
                id: "table-users",
                tenantId: mockTenantId
            } as unknown as DatavaultTable);
            vi.mocked(datavaultRowsRepository.findRowByColumnValue).mockResolvedValue(null);
            const result = await runner.executeWrite(writeConfig, mockContext, mockTenantId);
            expect(result.success).toBe(false);
            expect(result.error).toContain("Row not found");
        });
    });

    describe("Mode: Upsert", () => {
        const upsertConfig = (value: string = "Active"): WriteBlockConfig => ({
            tableId: "table-users",
            dataSourceId: "ds-native",
            mode: "upsert",
            matchStrategy: {
                type: "column_match",
                columnId: "col-email",
                columnValue: "test@example.com",
            },
            columnMappings: [
                { columnId: "col-status", value },
            ],
        });

        it.each([
            ["number", "not-a-number", "Column 'Age' must be a valid number"],
            ["select", "unlisted", "Column 'Status' has invalid option"],
            ["reference", "not-a-uuid", "Column 'Manager' must be a valid UUID"],
        ])("rejects an invalid %s value with the same validation error as update mode", async (_type, value, validationError) => {
            vi.mocked(datavaultRowsRepository.findRowByColumnValue).mockResolvedValue("row-existing-1");
            vi.mocked(datavaultRowsService.updateRow).mockRejectedValue(new Error(validationError));

            const updateConfig: WriteBlockConfig = {
                ...upsertConfig(value),
                mode: "update",
            };
            const updateResult = await runner.executeWrite(updateConfig, mockContext, mockTenantId);
            const upsertResult = await runner.executeWrite(upsertConfig(value), mockContext, mockTenantId);

            expect(updateResult).toMatchObject({ success: false, error: validationError });
            expect(upsertResult).toMatchObject({ success: false, error: validationError });
            expect(datavaultRowsRepository.updateRowValues).not.toHaveBeenCalled();
        });

        it("validates and updates an existing row through the row service", async () => {
            vi.mocked(datavaultRowsRepository.findRowByColumnValue).mockResolvedValue("row-existing-1");

            const result = await runner.executeWrite(upsertConfig(), mockContext, mockTenantId);

            expect(result).toMatchObject({
                success: true,
                rowId: "row-existing-1",
                operation: "update",
            });
            expect(datavaultRowsService.updateRow).toHaveBeenCalledWith(
                "row-existing-1",
                mockTenantId,
                { "col-status": "Active" },
                mockContext.userId,
                expect.anything()
            );
            expect(datavaultRowsRepository.updateRowValues).not.toHaveBeenCalled();
        });

        it("creates a live row when the match exists only on an archived row", async () => {
            vi.mocked(datavaultRowsRepository.findRowByColumnValue).mockResolvedValue(null);

            const result = await runner.executeWrite(upsertConfig(), mockContext, mockTenantId);

            expect(result).toMatchObject({ success: true, rowId: "row-new", operation: "create" });
            expect(datavaultRowsService.createRow).toHaveBeenCalledOnce();
            expect(datavaultRowsService.updateRow).not.toHaveBeenCalled();
        });

        it("passes tenant scope to the match query and creates when another tenant cannot match", async () => {
            const otherTenantId = "tenant-other";
            vi.mocked(datavaultRowsRepository.findRowByColumnValue).mockResolvedValue(null);

            const result = await runner.executeWrite(upsertConfig(), mockContext, otherTenantId);

            expect(result.operation).toBe("create");
            expect(datavaultRowsRepository.findRowByColumnValue).toHaveBeenCalledWith(
                "table-users",
                "col-email",
                "test@example.com",
                expect.objectContaining({ tenantId: otherTenantId, forUpdate: true })
            );
        });

        it("retries the match and performs a validated update after a uniqueness conflict", async () => {
            vi.mocked(datavaultRowsRepository.findRowByColumnValue)
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce("row-winner");
            vi.mocked(datavaultRowsService.createRow).mockRejectedValue(
                new ConflictError("A row with this column 'Email' already exists")
            );

            const result = await runner.executeWrite(upsertConfig(), mockContext, mockTenantId);

            expect(result).toMatchObject({ success: true, rowId: "row-winner", operation: "update" });
            expect(datavaultRowsRepository.findRowByColumnValue).toHaveBeenCalledTimes(2);
            expect(datavaultRowsService.updateRow).toHaveBeenCalledWith(
                "row-winner",
                mockTenantId,
                { "col-status": "Active" },
                mockContext.userId,
                expect.anything()
            );
        });
    });

    it("does not log the write config or resolved values", async () => {
        const sensitiveValue = "private interview answer";
        const writeConfig: WriteBlockConfig = {
            tableId: "table-users",
            dataSourceId: "ds-native",
            mode: "create",
            columnMappings: [{ columnId: "col-first", value: sensitiveValue }],
        };

        await runner.executeWrite(writeConfig, mockContext, mockTenantId, true);

        const loggedPayloads = mockLogger.info.mock.calls.map(([payload]) => payload);
        expect(loggedPayloads).not.toHaveLength(0);
        for (const payload of loggedPayloads) {
            expect(payload).not.toHaveProperty("config");
            expect(payload).not.toHaveProperty("values");
            expect(payload).not.toHaveProperty("matchValue");
            expect(JSON.stringify(payload)).not.toContain(sensitiveValue);
        }
    });

    it("audits block writes (AC5) with actor, tenant, tableId, rowId, column ids and no sensitive values", async () => {
        const auditLogSpy = vi.mocked(AuditLogger.log);
        const sensitiveValue = "secret-token-123";
        const writeConfig: WriteBlockConfig = {
            tableId: "table-users",
            dataSourceId: "ds-native",
            mode: "create",
            columnMappings: [{ columnId: "col-first", value: sensitiveValue }],
        };

        const result = await runner.executeWrite(writeConfig, mockContext, mockTenantId, false);

        expect(result.success).toBe(true);
        expect(auditLogSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: mockContext.userId,
                tenantId: mockTenantId,
                action: "datavault.row.created",
                resourceType: "datavault_row",
                resourceId: "row-new",
                after: expect.objectContaining({
                    tableId: "table-users",
                    columnIds: expect.arrayContaining(["col-first"]),
                    columnCount: 1,
                    source: "send_data_to_table_block",
                }),
            })
        );
        const lastCall = auditLogSpy.mock.calls[auditLogSpy.mock.calls.length - 1];
        expect(JSON.stringify(lastCall)).not.toContain(sensitiveValue);
    });
});
