# Query & List Engine

The Query & List Engine provides a high-performance, safe way for workflows to access data stored in Native Tables. It abstracts the underlying EAV (Entity-Attribute-Value) storage model into live, sortable, and filterable Lists.

## Key Concepts

### Workflow Query
A `WorkflowQuery` is a definition of how to fetch data from a Table. It includes:
- **Table**: The source table.
- **Filters**: Criteria to restrict rows (e.g. `Status = "Active"`).
- **Sort**: Order of results.
- **Limit**: Max rows to return.

Queries are stored in the `workflow_queries` table and linked to a Workflow.

### List Variable
When a Query is executed, it produces a `ListVariable`. This is a live object available in the workflow runtime (and JS blocks).
```typescript
interface ListVariable {
  id: string;
  name: string; // e.g. "activeUsers"
  rowCount: number;
  rows: Record<string, any>[]; // Array of row objects
}
```

## Usage

### Defining a Query
Queries are defined in the Workflow Builder (UI implementation pending).

### Using in Variables
You can filter queries using other workflow variables:
- `Status = {{data.statusFilter}}`
- `Amount > {{inputs.minAmount}}`

### Performance
The engine uses optimized SQL subqueries (`WHERE EXISTS`) to filter EAV data efficiently without needing expensive pivots or in-memory filtering for large datasets.

## Developer Guide

### Executing a Query Programmatically
```typescript
import { queryRunner } from '@server/lib/queries/QueryRunner';

const list = await queryRunner.executeQuery(queryDef, runtimeVariables, tenantId);
console.log(list.rowCount);
console.log(list.rows);
```

### Binding to UI (Dropdowns)
Use `QueryService.getListOptions` to easily fetch label/value pairs for frontend components.
```typescript
const options = await queryService.getListOptions(queryId, labelColId, valueColId, vars, tenantId);
// Returns: [{ label: "John", value: "uuid..." }, ...]
```
