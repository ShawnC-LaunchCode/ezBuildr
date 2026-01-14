import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const filePath = join(process.cwd(), 'migrations', '0007_lying_namor.sql');
let content = readFileSync(filePath, 'utf8');

// Regex to find ADD CONSTRAINT
// Matches: ALTER TABLE "table" ADD CONSTRAINT "constraint"
const regex = /ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)"/g;

let count = 0;
const newContent = content.replace(regex, (match, tableName, constraintName) => {
    count++;
    return `ALTER TABLE "${tableName}" DROP CONSTRAINT IF EXISTS "${constraintName}";--> statement-breakpoint\nALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}"`;
});

writeFileSync(filePath, newContent, 'utf8');
console.log(`Patched ${count} constraints in ${filePath}`);
