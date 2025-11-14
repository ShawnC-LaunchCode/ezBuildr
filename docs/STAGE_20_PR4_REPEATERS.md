# Stage 20 PR 4: Repeating Groups (Repeaters)

## Overview

Adds repeater field type for collecting multiple instances of the same set of questions. Enables forms like "Add dependents", "Multiple addresses", "Work history", etc.

## Database Changes

### Migration: `0022_add_repeater_type.sql`

1. Adds `'repeater'` to `step_type` enum
2. Adds `repeater_config` JSONB column to `steps` table

```sql
ALTER TYPE step_type ADD VALUE IF NOT EXISTS 'repeater';
ALTER TABLE steps ADD COLUMN IF NOT EXISTS repeater_config jsonb DEFAULT NULL;
```

## Schema Changes

### `stepTypeEnum`

```typescript
export const stepTypeEnum = pgEnum('step_type', [
  'short_text', 'long_text', 'multiple_choice', 'radio', 'yes_no',
  'computed', 'date_time', 'file_upload', 'loop_group', 'js_question',
  'repeater' // NEW
]);
```

### `steps` table

```typescript
repeaterConfig: jsonb("repeater_config") // Configuration for repeater fields
```

## Type Definitions

See `shared/types/repeater.ts` for complete types.

### RepeaterConfig

```typescript
interface RepeaterConfig {
  fields: RepeaterField[];          // Nested fields per instance
  minInstances?: number;            // Min instances (default: 0)
  maxInstances?: number;            // Max instances (default: unlimited)
  addButtonText?: string;           // "Add Another"
  removeButtonText?: string;        // "Remove"
  allowReorder?: boolean;           // Drag-to-reorder
  showInstanceTitle?: boolean;      // Show "Item #1", etc.
  instanceTitleTemplate?: string;   // "Dependent #{index}"
}
```

### RepeaterValue

Stored in `stepValues.value`:

```typescript
interface RepeaterValue {
  instances: RepeaterInstance[];
}

interface RepeaterInstance {
  instanceId: string;
  index: number;
  values: Record<string, any>;
}
```

## Core Service: RepeaterService

### Methods

#### `validateRepeater(value, config)`
Validates entire repeater (instance count + field values).

#### `addInstance(value, config)`
Adds new instance (respects maxInstances).

#### `removeInstance(value, instanceId, config)`
Removes instance (respects minInstances).

#### `reorderInstance(value, fromIndex, toIndex)`
Reorders instances.

#### `flattenRepeaterData(repeaterKey, value)`
Flattens for variable resolution (`dependents[0].age`).

#### `getInstanceTitle(instance, config)`
Generates instance title from template.

## Example Configuration

### Dependents Repeater

```typescript
{
  type: 'repeater',
  title: 'Dependents',
  alias: 'dependents',
  repeaterConfig: {
    fields: [
      { id: 'name', type: 'short_text', title: 'Full Name', required: true, order: 0 },
      { id: 'age', type: 'short_text', title: 'Age', required: true, order: 1 },
      { id: 'relationship', type: 'radio', title: 'Relationship', required: true, order: 2,
        options: [
          { label: 'Spouse', value: 'spouse' },
          { label: 'Child', value: 'child' },
          { label: 'Other', value: 'other' }
        ]
      }
    ],
    minInstances: 0,
    maxInstances: 10,
    addButtonText: 'Add Dependent',
    removeButtonText: 'Remove',
    showInstanceTitle: true,
    instanceTitleTemplate: 'Dependent #{index}'
  }
}
```

### Work History Repeater

```typescript
{
  type: 'repeater',
  title: 'Employment History',
  alias: 'employment',
  repeaterConfig: {
    fields: [
      { id: 'company', type: 'short_text', title: 'Company Name', required: true, order: 0 },
      { id: 'position', type: 'short_text', title: 'Position', required: true, order: 1 },
      { id: 'startDate', type: 'date_time', title: 'Start Date', required: true, order: 2 },
      { id: 'endDate', type: 'date_time', title: 'End Date', required: false, order: 3 },
      { id: 'current', type: 'yes_no', title: 'Currently Employed', required: false, order: 4 }
    ],
    minInstances: 1,
    maxInstances: 20,
    allowReorder: true,
    instanceTitleTemplate: 'Position #{index}'
  }
}
```

## Validation

### Instance Count Validation

- **Min instances**: Enforced globally
- **Max instances**: UI prevents adding beyond max
- **Global errors**: "At least 2 item(s) required"

### Field Validation

- Required fields validated per instance
- Instance errors tracked separately: `Map<instanceId, errors[]>`
- Hidden fields skipped (supports field-level visibleIf)

### Example Validation Result

```typescript
{
  valid: false,
  globalErrors: ['At least 1 item(s) required'],
  instanceErrors: Map {
    'inst-1' => ['Full Name is required', 'Age is required'],
    'inst-2' => ['Age is required']
  }
}
```

## Variable Resolution

Repeater values are flattened for use in conditions:

```typescript
// Repeater value:
{
  instances: [
    { instanceId: '...', index: 0, values: { name: 'John', age: 12 } },
    { instanceId: '...', index: 1, values: { name: 'Jane', age: 15 } }
  ]
}

// Flattened for conditions:
{
  'dependents[0].name': 'John',
  'dependents[0].age': 12,
  'dependents[1].name': 'Jane',
  'dependents[1].age': 15,
  'dependents.length': 2
}
```

### Example Condition Using Repeater

```typescript
// Show scholarship section if any dependent is under 18
{
  visibleIf: {
    or: [
      { op: 'lt', left: varRef('dependents[0].age'), right: value(18) },
      { op: 'lt', left: varRef('dependents[1].age'), right: value(18) }
    ]
  }
}
```

## Field-Level Visibility

Repeater fields support `visibleIf` conditions scoped to instance data:

```typescript
{
  fields: [
    { id: 'hasSpouse', type: 'yes_no', title: 'Married?', required: true, order: 0 },
    {
      id: 'spouseName',
      type: 'short_text',
      title: 'Spouse Name',
      required: true,
      order: 1,
      visibleIf: {
        op: 'equals',
        left: { type: 'variable', path: 'hasSpouse' },
        right: { type: 'value', value: true }
      }
    }
  ]
}
```

## UI Considerations (Future Frontend Implementation)

### Add/Remove Workflow

1. User clicks "Add Dependent" → calls `repeaterService.addInstance()`
2. New empty instance rendered
3. User fills fields
4. User clicks "Remove" → calls `repeaterService.removeInstance()`
5. Instance removed, others re-indexed

### Reordering

If `allowReorder: true`:
- Drag handles on each instance
- Calls `repeaterService.reorderInstance(fromIndex, toIndex)`

### Instance Titles

Display per instance:
```
Dependent #1
  [ Full Name input ]
  [ Age input ]
  [ Relationship dropdown ]
  [Remove button]

Dependent #2
  ...
```

## Testing

See `tests/unit/services/repeater.test.ts`:

✅ Instance count validation (min/max)
✅ Required field validation per instance
✅ Add instance (respects max)
✅ Remove instance (respects min)
✅ Reorder instances
✅ Data flattening for variables
✅ Instance title generation
✅ Field visibility within instances

## Integration Points

### Collections (PR 10)

Repeater data saved to collection records as JSON arrays:

```json
{
  "dependents": [
    { "name": "John", "age": 12, "relationship": "child" },
    { "name": "Jane", "age": 15, "relationship": "child" }
  ]
}
```

### Validation Engine (PR 6)

Will integrate `repeaterService.validateRepeater()` for step validation.

### State Machine (PR 7)

Runner state tracks repeater values and triggers validation on page submit.

## Known Limitations

1. **No nested repeaters**: Can't have repeater within repeater
2. **No dynamic field addition**: Fields defined at design time
3. **No cross-instance validation**: Can't compare instance 1 to instance 2
4. **No bulk operations**: Add/remove one instance at a time

## Future Enhancements

- [ ] Nested repeaters (repeaters within repeaters)
- [ ] Dynamic field templates (add fields at runtime)
- [ ] Cross-instance validation rules
- [ ] Bulk import from CSV
- [ ] Duplicate instance button
- [ ] Collapse/expand instances for long forms

## Files Changed/Added

### New Files

- `shared/types/repeater.ts` (120 lines)
- `server/services/RepeaterService.ts` (230 lines)
- `tests/unit/services/repeater.test.ts` (350+ lines)
- `migrations/0022_add_repeater_type.sql`
- `docs/STAGE_20_PR4_REPEATERS.md` (this file)

### Modified Files

- `shared/schema.ts` - Added 'repeater' to stepTypeEnum, added repeaterConfig column

## Next PR

**PR 5: File Upload Field + Storage Wiring**

Will add file upload field type with validation, preview, and storage integration hooks.
