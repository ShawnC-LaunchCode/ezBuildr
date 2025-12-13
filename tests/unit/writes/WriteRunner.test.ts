import { WriteRunner } from "../../../server/lib/writes/WriteRunner";
import { datavaultRowsRepository } from "../../../server/repositories";
import type { WriteBlockConfig, BlockContext } from "@shared/types/blocks";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock repositories
vi.mock("../../../server/repositories", () => ({
    datavaultRowsRepository: {
        createRowWithValues: vi.fn(),
        updateRowValues: vi.fn(),
        findRowByColumnValue: vi.fn(),
    },
    datavaultColumnsRepository: {},
    datavaultTablesRepository: {},
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
    });

    describe("Mode: Create", () => {
        it("should resolve values and call createRowWithValues", async () => {
            const config: WriteBlockConfig = {
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
                mode: "create",
                columnMappings: [
                    { columnId: "col-first", value: "firstName" }, // assuming direct key path for now, simplified resolution
                    { columnId: "col-last", value: "Doe" },
                    { columnId: "col-age", value: "age" }
                ]
            };

            (datavaultRowsRepository.createRowWithValues as any).mockResolvedValue({ row: { id: "row-new" } });

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
                "table-users", "col-email", "test@example.com", mockTenantId
            );
            expect(datavaultRowsRepository.updateRowValues).toHaveBeenCalledWith(
                "row-existing-1",
                [{ columnId: "col-status", value: "Active" }]
            );
        });

        it("should throw error if row not found", async () => {
            const writeConfig: WriteBlockConfig = {
                tableId: "table-users",
                mode: "update",
                primaryKeyColumnId: "col-email",
                primaryKeyValue: "missing@example.com",
                columnMappings: []
            };

            (datavaultRowsRepository.findRowByColumnValue as any).mockResolvedValue(null);

            await expect(runner.executeWrite(writeConfig, mockContext, mockTenantId))
                .rejects.toThrow("Row not found");
        });
    });
});
