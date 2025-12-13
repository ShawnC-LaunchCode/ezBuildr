# Query Blocks & List-Based Inputs

This feature enables workflows to query native database tables, populate lists, and drive logic or UI elements using that data.

## Key Components

### 1. Query Block
A new workflow block type (`query`) that executes a saved `WorkflowQuery`.
- **Output**: Generates a `ListVariable` containing rows and metadata.
- **Persistence**: The output is stored in a hidden "Virtual Step" (similar to Transform Blocks), making it available for subsequent blocks, logic, and bindings.
- **Persistence Table**: `step_values` (Value stored as JSON).

### 2. List-Based Logic
Workflow logic now supports dot-notation access to list properties and rows.
- `myList.rowCount` - Number of rows.
- `myList.rows` - Array of row objects.
- `myList.rows[0].name` - Access specific column of first row.

Supported in:
- **Condition Builder** (Validation, Visibility, Branching)
- **JavaScript Blocks** (via `data` context)

### 3. Data-Driven Repeaters
`RepeaterService` has been extended to support iterating over a `ListVariable`.
- **Config**: Select a List Variable as the source.
- **Execution**: Automatically creates repeater instances for each row in the list.
- **Mapping**: Fields in the repeater can be mapped to columns in the list via `alias` or explicit `sourceKey`.

### 4. UI Bindings
Helpers in `QueryService` allow binding Question Blocks (Dropdown, Radio, etc.) to a `WorkflowQuery`.
- **Live Options**: Fetches current options from the DB when the form loads.
- **Validation**: backend validates that submitted values exist in the list.

## Usage Example

1.  **Create Query**: Define a query "Get Active Employees" (filters: status='active').
2.  **Add Query Block**: Add to workflow, output variable name `employees`.
3.  **Add Repeater**: "Employee Details"
    - Source: `employees`
    - Field "Name" (alias `name`) -> Auto-fills from `employees.rows[i].name`.
    - Field "Department" (alias `dept`) -> Auto-fills from `employees.rows[i].dept`.

## Technical Implementation

- **BlockRunner**: Updates `executeQueryBlock` to retrieve query, execute via `QueryRunner`, and upsert result to `step_values`.
- **ConditionEvaluator**: Added `getValueByPath` to support nested property access.
- **RepeaterService**: Added `createFromList` to instantiate repeaters from `ListVariable`.
- **QueryService**: Added `getListOptions` and `validateValueInList` helpers.
