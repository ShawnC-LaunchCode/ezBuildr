import { datavaultRowsRepository, datavaultColumnsRepository, datavaultTablesRepository } from "../../repositories";
import { getValueByPath } from "@shared/conditionEvaluator";
import type { WriteBlockConfig, WriteResult, ColumnMapping, BlockContext } from "@shared/types/blocks";
import { createLogger } from "../../logger";

const logger = createLogger({ module: "write-runner" });

export class WriteRunner {
    /**
     * Execute a write operation
     */
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
            // 1. Resolve Values (Variables & Expressions)
            // This happens BEFORE preview check so we validate logic even in preview
            const mappedValues = this.resolveValues(config.columnMappings, context.data);

            // 2. Resolve Primary Key (if update mode)
            let primaryKeyValue: any = undefined;
            if (config.mode === "update") {
                if (!config.primaryKeyColumnId) throw new Error("Primary Key Column ID is required for update mode");
                // Resolve PK value (simple variable or expression supported by logic engine?)
                // The spec says "primaryKeyValue" is a WorkflowVariableRef (string). 
                // We can reuse resolveValues logic or getValueByPath directly if it's just a path.
                // Assuming simple path or static for now, or use same resolver.
                primaryKeyValue = this.resolveSingleValue(config.primaryKeyValue, context.data);

                if (primaryKeyValue === undefined || primaryKeyValue === null) {
                    throw new Error("Resolved Primary Key value is null/undefined");
                }
            }

            // 3. Preview Safety Check
            if (isPreview) {
                logger.info({
                    operation: "write_preview_simulated",
                    values: mappedValues,
                    primaryKey: primaryKeyValue
                }, "Simulating write in preview mode");

                return {
                    success: true,
                    tableId: config.tableId,
                    rowId: "preview-simulated-id",
                    writtenColumnIds: Object.keys(mappedValues),
                    operation: config.mode
                };
            }

            // 4. Execute Real Write
            let resultRowId: string;
            if (config.mode === "create") {
                resultRowId = await this.executeCreate(config.tableId, mappedValues, tenantId);
            } else {
                resultRowId = await this.executeUpdate(config.tableId, config.primaryKeyColumnId!, primaryKeyValue, mappedValues, tenantId);
            }

            return {
                success: true,
                tableId: config.tableId,
                rowId: resultRowId,
                writtenColumnIds: Object.keys(mappedValues),
                operation: config.mode
            };

        } catch (error) {
            logger.error({ error, config }, "Write execution failed");
            throw error; // Let BlockRunner handle the error response structure? Or return success: false here?
            // BlockRunner usually catches and formats errors.
        }
    }

    /**
     * Resolve column mappings to actual values using context data
     */
    private resolveValues(mappings: ColumnMapping[], data: Record<string, any>): Record<string, any> {
        const result: Record<string, any> = {};
        for (const mapping of mappings) {
            // TODO: Enhanced expression support. For now, try simple var resolution or static.
            // If value starts with {{ }} it might be handle bars, but here simpler dot notation access is implied
            // or we assume the value field IS the path if it matches a variable pattern.
            // For now, let's treat `value` as a path if it looks like one, or static.
            // Ideally we need the Tokenizer/Evaluator here if we want complex expressions.
            // Using `getValueByPath` which covers `step.var` access.

            const resolved = this.resolveSingleValue(mapping.value, data);
            result[mapping.columnId] = resolved;
        }
        return result;
    }

    private resolveSingleValue(expression: string | undefined, data: Record<string, any>): any {
        if (!expression) return null;

        // Simple heuristic: if it contains dots or looks like a var, try resolving
        // Actually strictly speaking, `getValueByPath` returns undefined if not found, 
        // but maybe we want to treat it as a literal string if not found?
        // For safety/strictness in "Write Blocks", explicit variable binding is frequent.
        // Let's rely on getValueByPath. If it returns undefined, check if it's meant to be a literal?
        // The prompt says "Expression" - usually implies {{ }}. 
        // Let's strip {{ }} if present.

        let path = expression;
        if (path.startsWith("{{") && path.endsWith("}}")) {
            path = path.slice(2, -2).trim();
        }

        const val = getValueByPath(data, path);
        // If val is defined, return it.
        if (val !== undefined) return val;

        // If strictly undefined, maybe it was a valid path that is empty?
        // Or maybe it is a static string? 
        // For now, return the expression as is if resolution fails, assuming static?
        // Safer to defaults to null if it looked like a variable.

        if (expression.includes("{{")) return null; // Failed var resolution
        return expression; // Static string
    }


    /**
     * Execute Create Operation
     */
    private async executeCreate(
        tableId: string,
        values: Record<string, any>, // key = columnId
        tenantId: string
    ): Promise<string> {
        // Transform map {colId: val} into array [{columnId, value}]
        const valueList = Object.entries(values).map(([columnId, value]) => ({
            columnId,
            value
        }));

        // We need a generic "insert row" method. DatavaultRowsRepository.createRowWithValues
        // requires InsertDatavaultRow struct.
        const rowData = {
            tableId,
            tenantId, // Ensure tenant isolation
            // metadata like createdBy could come from context if we had it
        };

        const result = await datavaultRowsRepository.createRowWithValues(rowData, valueList);
        return result.row.id;
    }

    /**
     * Execute Update Operation
     */
    private async executeUpdate(
        tableId: string,
        pkColumnId: string,
        pkValue: any,
        values: Record<string, any>,
        tenantId: string
    ): Promise<string> {
        // 1. Find the row ID based on the "Primary Key" logical concept (Column Value = pkValue)
        // Datavault doesn't strictly enforce one PK, but we treat `pkColumnId` as the lookup key.

        // We need a method to find row by (ColumnId, Value). 
        // datavaultRowsRepository.findByTableId has sort/filter, but maybe generic filter?
        // We can use a direct query or helper.

        // TODO: Implement findRowByColumnValue in repository or here.
        // For now assuming we have a way.
        const rowId = await this.findRowIdByColumnValue(tableId, pkColumnId, pkValue, tenantId);

        if (!rowId) {
            throw new Error(`Row not found for Table ${tableId} where Column ${pkColumnId} = ${pkValue}`);
        }

        const valueList = Object.entries(values).map(([columnId, value]) => ({
            columnId,
            value
        }));

        await datavaultRowsRepository.updateRowValues(rowId, valueList);
        return rowId;
    }

    private async findRowIdByColumnValue(
        tableId: string,
        columnId: string,
        value: any,
        tenantId: string
    ): Promise<string | null> {
        return await datavaultRowsRepository.findRowByColumnValue(tableId, columnId, value, tenantId);
    }
}

export const writeRunner = new WriteRunner();
