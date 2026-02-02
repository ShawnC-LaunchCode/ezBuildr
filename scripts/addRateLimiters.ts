/**
 * Script to add rate limiters to datavault route endpoints
 */

import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const filePath = path.join(__dirname, '../server/routes/datavault.routes.ts');

// Read the file
let content = fs.readFileSync(filePath, 'utf-8');

// Add rate limiters to specific endpoints
const replacements = [
  // DELETE endpoints - add deleteLimiter
  {
    from: /app\.delete\('\/api\/datavault\/databases\/:id', hybridAuth/g,
    to: "app.delete('/api/datavault/databases/:id', deleteLimiter, hybridAuth"
  },
  {
    from: /app\.delete\('\/api\/datavault\/tables\/:tableId', hybridAuth/g,
    to: "app.delete('/api/datavault/tables/:tableId', deleteLimiter, hybridAuth"
  },
  {
    from: /app\.delete\('\/api\/datavault\/columns\/:columnId', hybridAuth/g,
    to: "app.delete('/api/datavault/columns/:columnId', deleteLimiter, hybridAuth"
  },
  {
    from: /app\.delete\('\/api\/datavault\/rows\/:rowId', hybridAuth/g,
    to: "app.delete('/api/datavault/rows/:rowId', deleteLimiter, hybridAuth"
  },

  // CREATE endpoints - add createLimiter
  {
    from: /app\.post\('\/api\/datavault\/tables', hybridAuth/g,
    to: "app.post('/api/datavault/tables', createLimiter, hybridAuth"
  },
  {
    from: /app\.post\('\/api\/datavault\/tables\/:tableId\/columns', hybridAuth/g,
    to: "app.post('/api/datavault/tables/:tableId/columns', createLimiter, hybridAuth"
  },

  // Batch operations - add batchLimiter
  {
    from: /app\.post\('\/api\/datavault\/references\/batch', hybridAuth/g,
    to: "app.post('/api/datavault/references/batch', batchLimiter, hybridAuth"
  },

  // Expensive operations - add strictLimiter
  {
    from: /app\.post\('\/api\/datavault\/tables\/:tableId\/rows', hybridAuth/g,
    to: "app.post('/api/datavault/tables/:tableId/rows', strictLimiter, hybridAuth"
  },
];

// Apply all replacements
let changeCount = 0;
for (const { from, to } of replacements) {
  const before = content;
  content = content.replace(from, to);
  if (content !== before) {
    changeCount++;
    console.log(`✓ Applied: ${to.substring(0, 60)}...`);
  }
}

// Write the updated content
fs.writeFileSync(filePath, content, 'utf-8');

console.log(`\nCompleted: ${changeCount} rate limiters added`);
