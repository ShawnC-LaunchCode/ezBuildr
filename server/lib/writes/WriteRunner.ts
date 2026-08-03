import type { WriteBlockConfig, WriteResult, BlockContext } from "@shared/types/blocks";

import { db } from "../../db";
import { ConflictError } from "../../errors/AppError";
import { createLogger } from "../../logger";
import { datavaultRowsRepository, type DbTransaction } from "../../repositories";
import { datavaultRowsService } from "../../services/DatavaultRowsService";
import { resolveSingleValue, resolveColumnMappings } from "../shared/variableResolver";
const logger = createLogger({ module: "write-runner" });
export class WriteRunner {
    /**
     * Execute a write operation
     */
    // eslint-disable-next-line sonarjs/cognitive-complexity
    async executeWrite(
        config: WriteBlockConfig,
        context: BlockContext,
        tenantId: string,
        isPreview: boolean = false
    ): Promise<WriteResult> {
        logger.info({
            operation: "write_start",
            mode: config.mode,
            tableId: config.tableId,
            preview: isPreview
        }, "Starting write execution");
        try {
            // 0. Verify table exists and user has write permission
            const { datavaultTablesService } = await import("../../services/DatavaultTablesService");
            await datavaultTablesService.verifyTenantOwnership(config.tableId, tenantId);
            // 1. Resolve Values (Variables & Expressions)
            // This happens BEFORE preview check so we validate logic even in preview
            // Pass aliasMap to allow resolving variable aliases to step IDs
            const mappedValues = resolveColumnMappings(config.columnMappings, context.data, context.aliasMap);
            // 2. Resolve match strategy (for update and upsert modes)
            let matchColumnId: string | undefined;
            let matchValue: unknown;
            if (config.mode === "update" || config.mode === "upsert") {
                // Support new matchStrategy or legacy primaryKey fields
                if (config.matchStrategy) {
                    if (config.matchStrategy.type === "column_match") {
                        if (!config.matchStrategy.columnId) {
                            throw new Error("Match strategy column_match requires columnId");
                        }
                        matchColumnId = config.matchStrategy.columnId;
                        matchValue = resolveSingleValue(config.matchStrategy.columnValue, context.data, context.aliasMap);
                    } else if (config.matchStrategy.type === "primary_key") {
                        // For primary_key type, we need to determine the actual PK column
                        // This would require fetching table metadata
                        // For now, assume matchStrategy.columnId is provided
                        if (!config.matchStrategy.columnId) {
                            throw new Error("Match strategy primary_key requires columnId");
                        }
                        matchColumnId = config.matchStrategy.columnId;
                        matchValue = resolveSingleValue(config.matchStrategy.columnValue, context.data, context.aliasMap);
                    }
                } else if (config.primaryKeyColumnId && config.primaryKeyValue) {
                    // Legacy support
                    matchColumnId = config.primaryKeyColumnId;
                    matchValue = resolveSingleValue(config.primaryKeyValue, context.data, context.aliasMap);
                } else {
                    throw new Error(`${config.mode} mode requires matchStrategy or primaryKeyColumnId/primaryKeyValue`);
                }
                // eslint-disable-next-line sonarjs/no-collapsible-if
                if (matchValue === undefined || matchValue === null) {
                    if (config.mode === "update") {
                        throw new Error("Match value is null/undefined for update mode");
                    }
                    // For upsert, null match value means create new
                }
            }
            // 3. Preview Safety Check
            if (isPreview) {
                logger.info({
                    operation: "write_preview_simulated",
                    matchColumnId,
                    tableId: config.tableId
                }, "Simulating write in preview mode");
                return {
                    success: true,
                    tableId: config.tableId,
                    rowId: "preview-simulated-id",
                    writtenColumnIds: Object.keys(mappedValues),
                    operation: config.mode,
                    writtenData: mappedValues
                };
            }
            // 4. Execute Real Write (wrapped in transaction for atomicity)
            const writeResult = await db.transaction(async (tx: DbTransaction) => {
                let resultRowId: string;
                let actualOperation: "create" | "update" | "upsert" = config.mode;
                if (config.mode === "create") {
                    resultRowId = await this.executeCreate(config.tableId, mappedValues, tenantId, context.userId, tx);
                } else if (config.mode === "update") {
                    resultRowId = await this.executeUpdate(config.tableId, matchColumnId!, matchValue, mappedValues, tenantId, context.userId, tx);
                } else if (config.mode === "upsert") {
                    // Upsert: try to find existing row, update if found, create if not
                    const result = await this.executeUpsert(config.tableId, matchColumnId!, matchValue, mappedValues, tenantId, context.userId, tx);
                    resultRowId = result.rowId;
                    actualOperation = result.operation as "create" | "update" | "upsert";
                } else {
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    throw new Error(`Unknown write mode: ${config.mode}`);
                }
                return {
                    rowId: resultRowId,
                    operation: actualOperation
                };
            });
            return {
                success: true,
                tableId: config.tableId,
                rowId: writeResult.rowId,
                writtenColumnIds: Object.keys(mappedValues),
                operation: writeResult.operation,
                writtenData: mappedValues
            };
        } catch (error) {
            logger.error({
                error,
                mode: config.mode,
                tableId: config.tableId
            }, "Write execution failed");
            return {
                success: false,
                tableId: config.tableId,
                writtenColumnIds: [],
                operation: config.mode,
                error: error instanceof Error ? error.message : "Unknown error"
            };
        }
    }
    /**
     * Execute Create Operation
     */
    private async executeCreate(
        tableId: string,
        values: Record<string, unknown>,
        tenantId: string,
        userId: string | undefined,
        tx: DbTransaction
    ): Promise<string> {
        // Create row via service (handles validation and autonumber generation)
        const result = await datavaultRowsService.createRow(
            tableId,
            tenantId,
            values,
            userId,
            tx
        );
        return result.row.id;
    }
    /**
     * Execute Update Operation
     */
    // eslint-disable-next-line max-params
    private async executeUpdate(
        tableId: string,
        pkColumnId: string,
        pkValue: unknown,
        values: Record<string, unknown>,
        tenantId: string,
        userId: string | undefined,
        tx: DbTransaction
    ): Promise<string> {
        // 1. Find the row ID based on the "Primary Key" logical concept (Column Value = pkValue)
        // Datavault doesn't strictly enforce one PK, but we treat `pkColumnId` as the lookup key.
        const rowId = await this.findRowIdByColumnValue(tableId, pkColumnId, pkValue, tenantId, tx);
        if (!rowId) {
            throw new Error(`Row not found for Table ${tableId} where Column ${pkColumnId} = ${String(pkValue)}`);
        }
        // Update row via service
        await datavaultRowsService.updateRow(
            rowId,
            tenantId,
            values,
            userId,
            tx
        );
        return rowId;
    }
    // eslint-disable-next-line max-params
    private async findRowIdByColumnValue(
        tableId: string,
        columnId: string,
        value: unknown,
        tenantId: string,
        tx: DbTransaction,
        forUpdate: boolean = false
    ): Promise<string | null> {
        return datavaultRowsRepository.findRowByColumnValue(tableId, columnId, value, { tenantId, tx, forUpdate });
    }
    /**
     * Execute Upsert Operation
     * Try to find existing row by match column, update if found, create if not
     */
    // eslint-disable-next-line max-params
    private async executeUpsert(
        tableId: string,
        matchColumnId: string,
        matchValue: unknown,
        values: Record<string, unknown>,
        tenantId: string,
        userId: string | undefined,
        tx: DbTransaction
    ): Promise<{ rowId: string; operation: "create" | "update" }> {
        // If matchValue is null/undefined, create new row
        if (matchValue === undefined || matchValue === null) {
            logger.info({ tableId, matchColumnId }, "Upsert: match value is null, creating new row");
            const rowId = await this.executeCreate(tableId, values, tenantId, userId, tx);
            return { rowId, operation: "create" };
        }
        // The repository serializes upserts for this match key before checking for a row.
        // Existing rows are locked as well so the subsequent update remains atomic.
        const existingRowId = await this.findRowIdByColumnValue(tableId, matchColumnId, matchValue, tenantId, tx, true);
        if (existingRowId) {
            // Row exists (and is now locked), update it
            logger.info({ tableId, matchColumnId, existingRowId }, "Upsert: found existing row, updating");
            await datavaultRowsService.updateRow(existingRowId, tenantId, values, userId, tx);
            return { rowId: existingRowId, operation: "update" };
        }

        logger.info({ tableId, matchColumnId }, "Upsert: row not found, creating new");
        try {
            const rowId = await this.executeCreate(tableId, values, tenantId, userId, tx);
            return { rowId, operation: "create" };
        } catch (error) {
            if (!(error instanceof ConflictError)) {
                throw error;
            }

            // A writer outside this upsert path may win after the first match. When
            // uniqueness rejects our insert, match once more and perform a validated update.
            const retryRowId = await this.findRowIdByColumnValue(
                tableId,
                matchColumnId,
                matchValue,
                tenantId,
                tx,
                true
            );
            if (!retryRowId) {
                throw error;
            }

            await datavaultRowsService.updateRow(retryRowId, tenantId, values, userId, tx);
            return { rowId: retryRowId, operation: "update" };
        }
    }
}
export const writeRunner = new WriteRunner();
