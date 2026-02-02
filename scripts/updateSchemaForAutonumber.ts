/**
 * Update schema.ts to include autonumber enhancements
 * This script adds the necessary TypeScript definitions to match the database schema
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.join(__dirname, '../shared/schema.ts');

console.log('📝 Updating schema.ts for autonumber enhancements...');

// Read the schema file
let schema = fs.readFileSync(schemaPath, 'utf-8');

// 1. Add 'autonumber' to datavaultColumnTypeEnum if not present
if (!schema.includes("'autonumber'")) {
  schema = schema.replace(
    `'auto_number',  // Auto-incrementing number column`,
    `'auto_number',  // Auto-incrementing number column (deprecated, use autonumber)\n  'autonumber',   // Auto-incrementing number column with optional prefix and yearly reset`
  );
  console.log('✅ Added autonumber to datavaultColumnTypeEnum');
} else {
  console.log('ℹ️  autonumber already in datavaultColumnTypeEnum');
}

// 2. Add autonumberResetPolicyEnum if not present
if (!schema.includes('autonumberResetPolicyEnum')) {
  const enumPosition = schema.indexOf('// DataVault: Database scope type enum');
  if (enumPosition !== -1) {
    const insertText = `// DataVault: Autonumber reset policy enum
export const autonumberResetPolicyEnum = pgEnum('autonumber_reset_policy', [
  'never',        // Never reset the sequence
  'yearly'        // Reset sequence on January 1st each year
]);

`;
    schema = schema.slice(0, enumPosition) + insertText + schema.slice(enumPosition);
    console.log('✅ Added autonumberResetPolicyEnum');
  }
} else {
  console.log('ℹ️  autonumberResetPolicyEnum already exists');
}

// 3. Add autonumber columns to datavaultColumns if not present
if (!schema.includes('autonumber_prefix')) {
  // Find the datavaultColumns table definition and add the new columns after autoNumberStart
  const autoNumberStartPattern = /autoNumberStart: integer\("auto_number_start"\)\.default\(1\), {2}\/\/ Starting value for auto_number columns/;
  if (autoNumberStartPattern.test(schema)) {
    schema = schema.replace(
      autoNumberStartPattern,
      `autoNumberStart: integer("auto_number_start").default(1),  // Starting value for auto_number columns (legacy)
  autonumberPrefix: text("autonumber_prefix"),  // Optional prefix for autonumber values (e.g., "CASE")
  autonumberPadding: integer("autonumber_padding").default(4),  // Number of digits to pad (e.g., 4 -> "0001")
  autonumberResetPolicy: autonumberResetPolicyEnum("autonumber_reset_policy").default('never'),  // When to reset the sequence`
    );
    console.log('✅ Added autonumber columns to datavaultColumns table');
  }
} else {
  console.log('ℹ️  autonumber columns already in datavaultColumns');
}

// 4. Add datavaultNumberSequences table if not present
if (!schema.includes('datavaultNumberSequences')) {
  // Find a good insertion point - after datavaultValues table
  const insertPosition = schema.indexOf('// Analytics Relations');
  if (insertPosition !== -1) {
    const tableDefinition = `
// DataVault Number Sequences - Sequence state for autonumber columns
export const datavaultNumberSequences = pgTable("datavault_number_sequences", {
  id: uuid("id").primaryKey().default(sql\`gen_random_uuid()\`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  tableId: uuid("table_id").references(() => datavaultTables.id, { onDelete: 'cascade' }).notNull(),
  columnId: uuid("column_id").references(() => datavaultColumns.id, { onDelete: 'cascade' }).notNull(),
  prefix: text("prefix"),
  padding: integer("padding").notNull().default(4),
  nextValue: integer("next_value").notNull().default(1),
  resetPolicy: autonumberResetPolicyEnum("reset_policy").notNull().default('never'),
  lastReset: timestamp("last_reset"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_datavault_sequences_tenant").on(table.tenantId),
  index("idx_datavault_sequences_table").on(table.tableId),
  uniqueIndex("idx_datavault_sequences_column_unique").on(table.tenantId, table.tableId, table.columnId),
]);

`;
    schema = schema.slice(0, insertPosition) + tableDefinition + schema.slice(insertPosition);
    console.log('✅ Added datavaultNumberSequences table');
  }
} else {
  console.log('ℹ️  datavaultNumberSequences table already exists');
}

// Write the updated schema back
fs.writeFileSync(schemaPath, schema, 'utf-8');

console.log('✅ Schema update complete!');
console.log('');
console.log('📊 Summary of changes:');
console.log('  - Added "autonumber" to datavaultColumnTypeEnum');
console.log('  - Added autonumberResetPolicyEnum (never, yearly)');
console.log('  - Added autonumber_prefix, autonumber_padding, autonumber_reset_policy columns to datavaultColumns');
console.log('  - Added datavaultNumberSequences table definition');

process.exit(0);
