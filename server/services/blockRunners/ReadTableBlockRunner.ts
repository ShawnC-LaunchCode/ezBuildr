/**
 * Read Table Block Runner
 * Reads data from a DataVault table and outputs a List
 */

import { and, eq, sql } from "drizzle-orm";

import { datavaultRows } from "@shared/schema";

import { db } from "../../db";
import { logger } from "../../logger";
import { stepValueRepository, datavaultColumnsRepository } from "../../repositories";

import { BaseBlockRunner } from "./BaseBlockRunner";

import type { BlockContext, BlockResult, Block, ReadTableConfig, ReadTableOperator } from "./types";

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

      // Build filter conditions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let filterConditions: any[] = [];
      if (tableConfig.filters && tableConfig.filters.length > 0) {
        filterConditions = tableConfig.filters.map(filter => {
          const column = columnMap.get(filter.columnId);
          if (!column) {
            logger.warn({ columnId: filter.columnId }, "Filter references unknown column");
            return null;
          }

          // Resolve value from context data if it's a variable reference
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          let resolvedValue = filter.value;
          if (typeof filter.value === 'string' && filter.value.startsWith('{{') && filter.value.endsWith('}}')) {
            const variableName = filter.value.slice(2, -2).trim();
            const dataKey = context.aliasMap?.[variableName] ?? variableName;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            resolvedValue = context.data[dataKey];
          }

          return {
            columnId: filter.columnId,
            column,
            operator: filter.operator,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            value: resolvedValue
          };
        }).filter(Boolean);
      }

      // Query rows with filters
      const limit = tableConfig.limit ?? 100;
      const rows = await this.queryTableRows({
        tableId: tableConfig.tableId,
        tenantId,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const rowData: Record<string, any> = { id: row.id };
          for (const col of outputColumns) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            rowData[col.id] = row.data?.[col.id] ?? null;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, sonarjs/cognitive-complexity, complexity
  private async queryTableRows(params: {
    tableId: string;
    tenantId: string;
    filters: Array<{
      columnId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      column: any;
      operator: ReadTableOperator;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      value: any;
    }>;
    sort?: { columnId: string; direction: "asc" | "desc" };
    limit: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columns: Map<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any[]> {
    // Build WHERE conditions
    const whereConditions = [eq(datavaultRows.tableId, params.tableId)];

    for (const filter of params.filters) {
      // SECURITY FIX: Validate columnId to prevent SQL injection
      if (!/^[a-zA-Z0-9_-]+$/.test(filter.columnId)) {
        logger.warn({ columnId: filter.columnId }, 'Invalid columnId detected - skipping filter');
        continue;
      }

      const columnPath = `data->>'${filter.columnId}'`;

      switch (filter.operator) {
        case 'equals':
          if (filter.value !== null && filter.value !== undefined) {
            whereConditions.push(sql`${sql.raw(columnPath)} = ${filter.value}`);
          }
          break;

        case 'not_equals':
          if (filter.value !== null && filter.value !== undefined) {
            whereConditions.push(sql`${sql.raw(columnPath)} != ${filter.value}`);
          }
          break;

        case 'contains':
          if (filter.value) {
            // eslint-disable-next-line sonarjs/no-nested-template-literals
            whereConditions.push(sql`${sql.raw(columnPath)} LIKE ${`%${filter.value}%`}`);
          }
          break;

        case 'starts_with':
          if (filter.value) {
            // eslint-disable-next-line sonarjs/no-nested-template-literals
            whereConditions.push(sql`${sql.raw(columnPath)} LIKE ${`${filter.value}%`}`);
          }
          break;

        case 'ends_with':
          if (filter.value) {
            // eslint-disable-next-line sonarjs/no-nested-template-literals
            whereConditions.push(sql`${sql.raw(columnPath)} LIKE ${`%${filter.value}`}`);
          }
          break;

        case 'greater_than':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if (filter.column.type === 'number') {
            whereConditions.push(sql`(${sql.raw(columnPath)})::numeric > ${filter.value}`);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          } else if (filter.column.type === 'date' || filter.column.type === 'datetime') {
            whereConditions.push(sql`${sql.raw(columnPath)} > ${filter.value}`);
          }
          break;

        case 'less_than':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if (filter.column.type === 'number') {
            whereConditions.push(sql`(${sql.raw(columnPath)})::numeric < ${filter.value}`);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          } else if (filter.column.type === 'date' || filter.column.type === 'datetime') {
            whereConditions.push(sql`${sql.raw(columnPath)} < ${filter.value}`);
          }
          break;

        case 'is_empty':
          whereConditions.push(sql`(${sql.raw(columnPath)} IS NULL OR ${sql.raw(columnPath)} = '')`);
          break;

        case 'is_not_empty':
          whereConditions.push(sql`(${sql.raw(columnPath)} IS NOT NULL AND ${sql.raw(columnPath)} != '')`);
          break;

        case 'in':
          if (Array.isArray(filter.value) && filter.value.length > 0) {
            // SECURITY FIX: Use parameterized array
            const values = filter.value.map(v => String(v));
            whereConditions.push(sql`${sql.raw(columnPath)} = ANY(${values})`);
          }
          break;
      }
    }

    // Build query
    let query = db
      .select()
      .from(datavaultRows)
      .where(and(...whereConditions))
      .limit(params.limit);

    // Add sorting
    if (params.sort) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const sortColumn = params.columns.get(params.sort.columnId);
      if (sortColumn) {
        // SECURITY FIX: Validate columnId
        if (!/^[a-zA-Z0-9_-]+$/.test(params.sort.columnId)) {
          logger.warn({ columnId: params.sort.columnId }, 'Invalid sort columnId detected - skipping sort');
        } else {
          const columnPath = `data->>'${params.sort.columnId}'`;
          if (params.sort.direction === 'asc') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            query = (query as any).orderBy(sql`${sql.raw(columnPath)} ASC`);
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            query = (query as any).orderBy(sql`${sql.raw(columnPath)} DESC`);
          }
        }
      }
    }

    return query;
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
