import React, { ReactNode } from "react";

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  align?: "left" | "center" | "right";
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  emptyState?: ReactNode;
  className?: string;
  getRowKey: (row: T) => string;
}

/**
 * DataTable - Reusable table component for displaying structured data
 *
 * @example
 * const columns: Column<QuestionAnalytics>[] = [
 *   { header: "Question", accessor: "questionTitle", align: "left" },
 *   { header: "Type", accessor: (row) => <Badge>{row.questionType}</Badge>, align: "left" },
 *   { header: "Views", accessor: "totalViews", align: "right" }
 * ];
 *
 * <DataTable
 *   data={questionAnalytics}
 *   columns={columns}
 *   getRowKey={(row) => row.questionId}
 *   emptyState={<p>No data available</p>}
 * />
 */
export function DataTable<T>({
  data,
  columns,
  emptyState,
  className = "",
  getRowKey
}: DataTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full">
        <thead>
          <tr className="border-b">
            {columns.map((column, index) => (
              <th
                key={index}
                className={`p-2 ${
                  column.align === "right"
                    ? "text-right"
                    : column.align === "center"
                    ? "text-center"
                    : "text-left"
                } ${column.className || ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={getRowKey(row)} className="border-b">
              {columns.map((column, colIndex) => {
                const value =
                  typeof column.accessor === "function"
                    ? column.accessor(row)
                    : row[column.accessor];

                return (
                  <td
                    key={colIndex}
                    className={`p-2 ${
                      column.align === "right"
                        ? "text-right"
                        : column.align === "center"
                        ? "text-center"
                        : "text-left"
                    } ${column.className || ""}`}
                  >
                    {value as ReactNode}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
