/**
 * Read Table Block Runner
 * Reads data from a DataVault table and outputs a List
 */

import { and, asc, desc, eq, exists, inArray, isNull, not, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { datavaultRows, datavaultValues } from "@shared/schema";
import type { DatavaultColumn } from "@shared/schema";

import { db } from "../../db";
import { logger } from "../../logger";
import { stepValueRepository, datavaultColumnsRepository } from "../../repositories";

import { BaseBlockRunner } from "./BaseBlockRunner";

import type { BlockContext, BlockResult, Block, ReadTableConfig, ReadTableOperator } from "./types";

import type { SQL, SQLWrapper } from "drizzle-orm";

type ReadTableQueryFilter = {
  columnId: string;
  column: DatavaultColumn;
  operator: ReadTableOperator;
  value: unknown;
};

type ReadTableQueryRow = {
  id: string;
  values: Record<string, unknown>;
};

function scalarText(valueColumn: SQLWrapper): SQL {
  return sql`${valueColumn} #>> '{}'`;
}

function nonEmptyValue(valueColumn: SQLWrapper): SQL {
  return sql`${valueColumn} IS NOT NULL AND ${valueColumn} != 'null'::jsonb AND ${valueColumn} != '""'::jsonb`;
}

function buildStringCondition(
  valueColumn: SQLWrapper,
  operator: 'contains' | 'starts_with' | 'ends_with',
  value: unknown
): SQL | undefined {
  if (!value) {
    return undefined;
  }
  const stringValue = String(value);
  const pattern = operator === 'contains'
    ? `%${stringValue}%`
    : operator === 'starts_with'
      ? `${stringValue}%`
      : `%${stringValue}`;
  return sql`${scalarText(valueColumn)} LIKE ${pattern}`;
}

function buildComparisonCondition(
  valueColumn: SQLWrapper,
  filter: ReadTableQueryFilter,
  operator: 'greater_than' | 'less_than'
): SQL | undefined {
  const textValue = scalarText(valueColumn);
  const isGreaterThan = operator === 'greater_than';
  if (filter.column.type === 'number') {
    return isGreaterThan
      ? sql`(${textValue})::numeric > ${filter.value}`
      : sql`(${textValue})::numeric < ${filter.value}`;
  }
  if (filter.column.type === 'date') {
    return isGreaterThan
      ? sql`(${textValue})::date > ${filter.value}`
      : sql`(${textValue})::date < ${filter.value}`;
  }
  if (filter.column.type === 'datetime') {
    return isGreaterThan
      ? sql`(${textValue})::timestamp > ${filter.value}`
      : sql`(${textValue})::timestamp < ${filter.value}`;
  }
  return undefined;
}

function buildInCondition(
  valueColumn: SQLWrapper,
  value: unknown
): SQL | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const comparisons = value
    .filter(item => item !== undefined)
    .map(item => sql`${valueColumn} = ${JSON.stringify(item)}::jsonb`);
  if (comparisons.length === 0) {
    return undefined;
  }
  const joinedComparisons = sql.join(comparisons, sql` OR `);
  return sql`(${joinedComparisons})`;
}

function buildValueCondition(
  valueColumn: SQLWrapper,
  filter: ReadTableQueryFilter
): SQL | undefined {
  switch (filter.operator) {
    case 'equals':
      return filter.value === null || filter.value === undefined
        ? undefined
        : sql`${valueColumn} = ${JSON.stringify(filter.value)}::jsonb`;
    case 'not_equals':
      return filter.value === null || filter.value === undefined
        ? undefined
        : sql`${valueColumn} != ${JSON.stringify(filter.value)}::jsonb`;
    case 'contains':
    case 'starts_with':
    case 'ends_with':
      return buildStringCondition(valueColumn, filter.operator, filter.value);
    case 'greater_than':
    case 'less_than':
      return buildComparisonCondition(valueColumn, filter, filter.operator);
    case 'is_not_empty':
      return nonEmptyValue(valueColumn);
    case 'in':
      return buildInCondition(valueColumn, filter.value);
    default:
      return undefined;
  }
}

function sortExpression(
  valueColumn: SQLWrapper,
  column: DatavaultColumn
): SQL {
  const textValue = scalarText(valueColumn);
  switch (column.type) {
    case 'number':
      return sql`(${textValue})::numeric`;
    case 'auto_number':
    case 'autonumber':
      return column.autonumberPrefix ? textValue : sql`(${textValue})::numeric`;
    case 'boolean':
      return sql`(${textValue})::boolean`;
    case 'date':
      return sql`(${textValue})::date`;
    case 'datetime':
      return sql`(${textValue})::timestamp`;
    default:
      return textValue;
  }
}

export class ReadTableBlockRunner extends BaseBlockRunner {
  getBlockType(): string {
    return "read_table";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async execute(config: any, context: BlockContext, block: Block): Promise<BlockResult> {
    const tableConfig = config as ReadTableConfig;
    try {
      // Check runCondition
      if (tableConfig.runCondition) {
        const shouldRun = this.evaluateCondition(tableConfig.runCondition, context.data);
        if (!shouldRun) {
          logger.info({ phase: context.phase }, "Skipping read_table block due to condition");
          return { success: true };
        }
      }

      // Get tenantId from workflow
      const tenantId = await this.getTenantIdFromWorkflow(context.workflowId);
      if (!tenantId) {
        return {
          success: false,
          errors: ["Failed to resolve tenantId from workflow"],
        };
      }

      // Import services dynamically to avoid circular dependencies
      const { datavaultTablesService } = await import('../DatavaultTablesService');

      // Verify table exists and belongs to tenant
      let table;
      try {
        table = await datavaultTablesService.verifyTenantOwnership(tableConfig.tableId, tenantId);
      } catch (error: unknown) {
        return {
          success: false,
          errors: [error instanceof Error ? error.message : 'Unknown error']
        };
      }

      // Get table columns for metadata
      const allColumns = await datavaultColumnsRepository.findByTableId(tableConfig.tableId);
      const columnMap = new Map(allColumns.map(c => [c.id, c]));

      // Determine selected columns for output
      let outputColumns = allColumns;
      if (tableConfig.columns && tableConfig.columns.length > 0) {
        outputColumns = allColumns.filter(c => tableConfig.columns!.includes(c.id));
      }

      // Resolve filters and discard references to columns outside this table.
      let filterConditions: ReadTableQueryFilter[] = [];
      if (tableConfig.filters && tableConfig.filters.length > 0) {
        filterConditions = tableConfig.filters.flatMap(filter => {
          const column = columnMap.get(filter.columnId);
          if (!column) {
            logger.warn({ columnId: filter.columnId }, "Filter references unknown column");
            return [];
          }

          // Resolve value from context data if it's a variable reference
          let resolvedValue: unknown = filter.value;
          if (typeof filter.value === 'string' && filter.value.startsWith('{{') && filter.value.endsWith('}}')) {
            const variableName = filter.value.slice(2, -2).trim();
            const dataKey = context.aliasMap?.[variableName] ?? variableName;
            resolvedValue = context.data[dataKey];
          }

          return [{
            columnId: filter.columnId,
            column,
            operator: filter.operator,
            value: resolvedValue
          }];
        });
      }

      // Query rows with filters
      const limit = tableConfig.limit ?? 100;
      const rows = await this.queryTableRows({
        tableId: tableConfig.tableId,
        filters: filterConditions,
        sort: tableConfig.sort,
        limit,
        columns: columnMap
      });

      // Build standardized list variable result
      const listVariable = {
        metadata: {
          source: 'read_table' as const,
          sourceId: tableConfig.tableId,
          tableName: table.name,
          queryParams: {
            filters: tableConfig.filters,
            sort: tableConfig.sort,
            limit: tableConfig.limit,
            selectedColumns: tableConfig.columns
          },
          filteredBy: tableConfig.filters?.map(f => f.columnId),
          sortedBy: tableConfig.sort
        },
        rows: rows.map(row => {
          // Convert internal row structure to column name-accessible object
          const rowData: Record<string, unknown> = { id: row.id };
          for (const col of outputColumns) {
            rowData[col.id] = row.values[col.id] ?? null;
          }
          return rowData;
        }),
        count: rows.length,
        columns: outputColumns.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type
        }))
      };

      // Persist to virtual step if runId is present
      const persistenceWarnings: string[] = [];
      if (context.runId && block.virtualStepId) {
        try {
          await stepValueRepository.upsert({
            runId: context.runId,
            stepId: block.virtualStepId,
            value: listVariable,
          });
          logger.debug({
            blockId: block.id,
            virtualStepId: block.virtualStepId,
            rowCount: listVariable.count
          }, "Persisted read_table block output");
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ error, blockId: block.id }, "Failed to persist read_table block output");
          persistenceWarnings.push(`Warning: Failed to persist output to virtual step: ${errorMsg}`);
        }
      }

      return {
        success: true,
        data: {
          [tableConfig.outputKey]: listVariable
        },
        // Include warnings if persistence failed (non-breaking but should be visible)
        ...(persistenceWarnings.length > 0 ? { errors: persistenceWarnings } : {})
      };

    } catch (error: unknown) {
      logger.error({ error, config: tableConfig }, "Read table block failed");
      return {
        success: false,
        errors: [`Read table failed: ${error instanceof Error ? error.message : 'unknown error'}`]
      };
    }
  }

  /**
   * Query table rows with filters and sorting
   * Internal helper method for read_table block
   */
  private async queryTableRows(params: {
    tableId: string;
    filters: ReadTableQueryFilter[];
    sort?: { columnId: string; direction: "asc" | "desc" };
    limit: number;
    columns: Map<string, DatavaultColumn>;
  }): Promise<ReadTableQueryRow[]> {
    const whereConditions: SQL[] = [
      eq(datavaultRows.tableId, params.tableId),
      isNull(datavaultRows.deletedAt),
    ];

    for (const [index, filter] of params.filters.entries()) {
      if (!/^[a-zA-Z0-9_-]+$/.test(filter.columnId)) {
        logger.warn({ columnId: filter.columnId }, 'Invalid columnId detected - skipping filter');
        continue;
      }

      const valueAlias = alias(datavaultValues, `read_filter_${index}`);
      const correlation = and(
        eq(valueAlias.rowId, datavaultRows.id),
        eq(valueAlias.columnId, filter.columnId)
      );

      if (filter.operator === 'is_empty') {
        whereConditions.push(not(exists(
          db.select({ one: sql`1` })
            .from(valueAlias)
            .where(and(correlation, nonEmptyValue(valueAlias.value)))
        )));
        continue;
      }

      const valueCondition = buildValueCondition(valueAlias.value, filter);
      if (valueCondition) {
        whereConditions.push(exists(
          db.select({ one: sql`1` })
            .from(valueAlias)
            .where(and(correlation, valueCondition))
        ));
      }
    }

    let selectedRows: Array<{ id: string }>;
    const sortColumn = params.sort ? params.columns.get(params.sort.columnId) : undefined;
    if (params.sort && sortColumn && /^[a-zA-Z0-9_-]+$/.test(params.sort.columnId)) {
      const sortValue = alias(datavaultValues, 'read_sort_value');
      const direction = params.sort.direction === 'desc' ? desc : asc;
      selectedRows = await db
        .select({ id: datavaultRows.id })
        .from(datavaultRows)
        .leftJoin(sortValue, and(
          eq(sortValue.rowId, datavaultRows.id),
          eq(sortValue.columnId, params.sort.columnId)
        ))
        .where(and(...whereConditions))
        .orderBy(direction(sortExpression(sortValue.value, sortColumn)))
        .limit(params.limit);
    } else {
      if (params.sort && !/^[a-zA-Z0-9_-]+$/.test(params.sort.columnId)) {
        logger.warn({ columnId: params.sort.columnId }, 'Invalid sort columnId detected - skipping sort');
      }
      selectedRows = await db
        .select({ id: datavaultRows.id })
        .from(datavaultRows)
        .where(and(...whereConditions))
        .limit(params.limit);
    }

    if (selectedRows.length === 0) {
      return [];
    }

    const rowIds = selectedRows.map(row => row.id);
    const values = await db
      .select({
        rowId: datavaultValues.rowId,
        columnId: datavaultValues.columnId,
        value: datavaultValues.value,
      })
      .from(datavaultValues)
      .where(inArray(datavaultValues.rowId, rowIds));
    const valuesByRow = new Map<string, Record<string, unknown>>();
    for (const value of values) {
      const rowValues = valuesByRow.get(value.rowId) ?? {};
      rowValues[value.columnId] = value.value;
      valuesByRow.set(value.rowId, rowValues);
    }

    return selectedRows.map(row => ({
      id: row.id,
      values: valuesByRow.get(row.id) ?? {},
    }));
  }

  /**
   * Helper: Get tenantId from workflowId
   */
  private async getTenantIdFromWorkflow(workflowId: string): Promise<string | null> {
    try {
      const { workflowRepository } = await import("../../repositories");
      const workflow = await workflowRepository.findById(workflowId);

      if (!workflow) {
        logger.warn({ workflowId }, "Workflow not found");
        return null;
      }

      // 1. Try Project linkage
      if (workflow.projectId) {
        const { projectRepository } = await import("../../repositories");
        const project = await projectRepository.findById(workflow.projectId);
        if (project) {
          return project.tenantId;
        }
        logger.warn(
          { projectId: workflow.projectId, workflowId },
          "Project not found for workflow, falling back to creator"
        );
      }

      // 2. Fallback: Creator's Tenant
      if (workflow.creatorId) {
        const { userRepository } = await import("../../repositories");
        const creator = await userRepository.findById(workflow.creatorId);

        if (creator?.tenantId) {
          return creator.tenantId;
        }
      }

      logger.warn(
        { workflowId, creatorId: workflow.creatorId },
        "Could not resolve tenantId from project or creator"
      );
      return null;
    } catch (error: unknown) {
      logger.error({ error, workflowId }, "Error fetching tenantId from workflow");
      return null;
    }
  }
}
