/**
 * Script to update all route files to use hybridAuth instead of isAuthenticated
 * This standardizes authentication across the codebase
 */

import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const routesDir = path.join(__dirname, '../server/routes');

// Files to update
const routeFiles = [
  'account.routes.ts',
  'ai.routes.ts',
  'auth.routes.ts',
  'blocks.routes.ts',
  'collections.routes.ts',
  'connections-v2.routes.ts',
  'dashboard.routes.ts',
  'export.routes.ts',
  'projects.routes.ts',
  'runs.routes.ts',
  'secrets.routes.ts',
  'sections.routes.ts',
  'steps.routes.ts',
  'templates.routes.ts',
  'templateSharing.routes.ts',
  'transformBlocks.routes.ts',
  'userPreferences.routes.ts',
  'versions.routes.ts',
  'workflowExports.routes.ts',
  'workflows.routes.ts',
];

function updateFile(filePath: string): void {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check if file uses isAuthenticated
  if (!content.includes('isAuthenticated')) {
    console.log(`✓ ${path.basename(filePath)} - already updated`);
    return;
  }

  let updatedContent = content;

  // Replace import statement
  updatedContent = updatedContent.replace(
    /import\s*{\s*isAuthenticated\s*}\s*from\s*(['"])\.\.\/googleAuth\1;?/g,
    'import { hybridAuth } from \'../middleware/auth\';'
  );

  // Replace usage in route definitions
  updatedContent = updatedContent.replace(
    /,\s*isAuthenticated,\s*/g,
    ', hybridAuth, '
  );

  // Write updated content
  fs.writeFileSync(filePath, updatedContent, 'utf-8');
  console.log(`✓ ${path.basename(filePath)} - updated`);
}

console.log('Updating route files to use hybridAuth...\n');

let successCount = 0;
let errorCount = 0;

for (const file of routeFiles) {
  const filePath = path.join(routesDir, file);

  try {
    if (fs.existsSync(filePath)) {
      updateFile(filePath);
      successCount++;
    } else {
      console.log(`⚠ ${file} - not found`);
    }
  } catch (error) {
    console.error(`✗ ${file} - error:`, error);
    errorCount++;
  }
}

console.log(`\nCompleted: ${successCount} files updated, ${errorCount} errors`);
