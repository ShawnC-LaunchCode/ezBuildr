# Autonumber Frontend Implementation Guide

## Overview
This document outlines the frontend changes needed to support the autonumber column type in DataVault v4.

## Components to Update

### 1. ColumnManager.tsx (`client/src/components/datavault/ColumnManager.tsx`)

#### State Additions (around line 59)
```typescript
// Add autonumber state
const [newColumnAutonumberPrefix, setNewColumnAutonumberPrefix] = useState("");
const [newColumnAutonumberPadding, setNewColumnAutonumberPadding] = useState(4);
const [newColumnAutonumberResetPolicy, setNewColumnAutonumberResetPolicy] = useState<'never' | 'yearly'>('never');

// Edit autonumber state
const [editColumnAutonumberPrefix, setEditColumnAutonumberPrefix] = useState("");
const [editColumnAutonumberPadding, setEditColumnAutonumberPadding] = useState(4);
const [editColumnAutonumberResetPolicy, setEditColumnAutonumberResetPolicy] = useState<'never' | 'yearly'>('never');
```

#### Add Autonumber to Column Type Dropdown (line 261)
```typescript
<SelectContent>
  <SelectItem value="text">Text</SelectItem>
  <SelectItem value="number">Number</SelectItem>
  <SelectItem value="boolean">Boolean</SelectItem>
  <SelectItem value="date">Date</SelectItem>
  <SelectItem value="datetime">Date/Time</SelectItem>
  <SelectItem value="email">Email</SelectItem>
  <SelectItem value="phone">Phone</SelectItem>
  <SelectItem value="url">URL</SelectItem>
  <SelectItem value="json">JSON</SelectItem>
  <SelectItem value="autonumber">Autonumber</SelectItem>  {/* ADD THIS */}
  <SelectItem value="select">Select (Single Choice)</SelectItem>
  <SelectItem value="multiselect">Multiselect (Multiple Choice)</SelectItem>
</SelectContent>
```

#### Add Autonumber Fields UI (after line 279)
```typescript
{(newColumnType === 'select' || newColumnType === 'multiselect') && (
  <OptionsEditor
    options={newColumnOptions}
    onChange={setNewColumnOptions}
  />
)}

{/* ADD THIS SECTION */}
{newColumnType === 'autonumber' && (
  <div className="grid gap-4 p-4 border rounded-md bg-muted/50">
    <div className="grid gap-2">
      <Label htmlFor="autonumber-prefix">
        Prefix (optional)
        <span className="text-xs text-muted-foreground ml-2">e.g., CASE, INV</span>
      </Label>
      <Input
        id="autonumber-prefix"
        placeholder="e.g., CASE"
        value={newColumnAutonumberPrefix}
        onChange={(e) => setNewColumnAutonumberPrefix(e.target.value)}
      />
    </div>

    <div className="grid gap-2">
      <Label htmlFor="autonumber-padding">
        Padding (number of digits)
      </Label>
      <Input
        id="autonumber-padding"
        type="number"
        min="1"
        max="10"
        value={newColumnAutonumberPadding}
        onChange={(e) => setNewColumnAutonumberPadding(parseInt(e.target.value) || 4)}
      />
    </div>

    <div className="grid gap-2">
      <Label htmlFor="autonumber-reset">Reset Policy</Label>
      <Select
        value={newColumnAutonumberResetPolicy}
        onValueChange={(value: 'never' | 'yearly') => setNewColumnAutonumberResetPolicy(value)}
      >
        <SelectTrigger id="autonumber-reset">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="never">Never</SelectItem>
          <SelectItem value="yearly">Reset yearly (Jan 1)</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div className="mt-2 p-3 bg-background border rounded-md">
      <div className="text-xs font-medium text-muted-foreground mb-1">Preview next value:</div>
      <div className="font-mono text-sm">
        {newColumnAutonumberResetPolicy === 'yearly'
          ? `${newColumnAutonumberPrefix ? newColumnAutonumberPrefix + '-' : ''}${new Date().getFullYear()}-${'0'.repeat(Math.max(0, newColumnAutonumberPadding - 1))}1`
          : `${newColumnAutonumberPrefix ? newColumnAutonumberPrefix + '-' : ''}${'0'.repeat(Math.max(0, newColumnAutonumberPadding - 1))}1`
        }
      </div>
    </div>
  </div>
)}
```

#### Update handleAddColumn (around line 74)
```typescript
await onAddColumn({
  name: newColumnName.trim(),
  type: newColumnType,
  required: newColumnRequired,
  options: (newColumnType === 'select' || newColumnType === 'multiselect') ? newColumnOptions : undefined,
  // ADD THESE FIELDS:
  autonumberPrefix: newColumnType === 'autonumber' ? (newColumnAutonumberPrefix || null) : undefined,
  autonumberPadding: newColumnType === 'autonumber' ? newColumnAutonumberPadding : undefined,
  autonumberResetPolicy: newColumnType === 'autonumber' ? newColumnAutonumberResetPolicy : undefined,
});

// Reset form
setNewColumnName("");
setNewColumnType("text");
setNewColumnRequired(false);
setNewColumnOptions([]);
// ADD THESE RESETS:
setNewColumnAutonumberPrefix("");
setNewColumnAutonumberPadding(4);
setNewColumnAutonumberResetPolicy('never');
setAddDialogOpen(false);
```

#### Update openEditDialog (around line 119)
```typescript
const openEditDialog = (column: DatavaultColumn) => {
  setEditDialog({
    id: column.id,
    name: column.name,
    required: column.required,
    type: column.type,
    options: column.options
  });
  setEditColumnName(column.name);
  setEditColumnRequired(column.required);
  setEditColumnOptions(column.options || []);

  // ADD THESE:
  setEditColumnAutonumberPrefix(column.autonumberPrefix || "");
  setEditColumnAutonumberPadding(column.autonumberPadding || 4);
  setEditColumnAutonumberResetPolicy(column.autonumberResetPolicy || 'never');
};
```

#### Add same Autonumber fields to Edit Dialog (similar to Add Dialog)

### 2. Grid Rendering

#### File: DataGrid component (wherever row values are rendered)

Make autonumber cells read-only:
```typescript
// When rendering cells:
const cellEditable = column.type !== 'autonumber'; // Autonumber cells are read-only

// Remove "Edit Cell" from right-click menu for autonumber columns
```

### 3. TypeScript Types

#### File: `client/src/lib/types/datavault.ts` or `shared/schema.ts`

Ensure DatavaultColumn type includes:
```typescript
autonumberPrefix?: string | null;
autonumberPadding?: number | null;
autonumberResetPolicy?: 'never' | 'yearly' | null;
```

### 4. API Client

#### File: `client/src/lib/datavault-api.ts` or similar

Update createColumn and updateColumn to accept autonumber fields:
```typescript
export async function createColumn(data: {
  tableId: string;
  name: string;
  type: string;
  required?: boolean;
  options?: SelectOption[];
  autonumberPrefix?: string | null;
  autonumberPadding?: number;
  autonumberResetPolicy?: 'never' | 'yearly';
}) {
  // ... implementation
}
```

## Testing Checklist

- [ ] Create an autonumber column with no prefix
- [ ] Create an autonumber column with prefix "CASE"
- [ ] Create an autonumber column with yearly reset
- [ ] Verify preview shows correct format
- [ ] Edit autonumber column settings
- [ ] Verify padding works (1-10 digits)
- [ ] Verify autonumber cells are read-only in grid
- [ ] Verify no "Edit Cell" option for autonumber columns
- [ ] Create multiple rows and verify sequential numbering
- [ ] Verify yearly reset format includes year

## Example Values

| Config | Example Output |
|--------|---------------|
| No prefix, padding 4, never reset | `0001`, `0002`, `0003` |
| Prefix "CASE", padding 5, never reset | `CASE-00001`, `CASE-00002` |
| Prefix "INV", padding 3, yearly reset | `INV-2025-001`, `INV-2025-002` |

## Implementation Status

✅ Backend complete
⏳ Frontend TODO

---

**Next Steps:**
1. Update ColumnManager.tsx with autonumber UI
2. Update grid rendering to make autonumber read-only
3. Test end-to-end workflow
