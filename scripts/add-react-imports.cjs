#!/usr/bin/env node

/**
 * Script to add React imports to tsx files that are missing them
 *
 * This script finds all .tsx files that import from 'react' but don't
 * have 'import React' and adds it.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Find all tsx files that import from 'react' but don't import React
const findFilesCommand = `find client/src tests -name "*.tsx" -type f`;

try {
  const files = execSync(findFilesCommand, { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(Boolean);

  console.log(`Found ${files.length} .tsx files to check`);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');

      // Check if file imports from 'react'
      const hasReactImport = /from ['"]react['"]/.test(content);

      // Check if file already has 'import React'
      const hasReactDefault = /^import React/m.test(content);

      if (hasReactImport && !hasReactDefault) {
        // Find the first import from 'react'
        const reactImportMatch = content.match(/^(import\s+{[^}]+}\s+from\s+['"]react['"];?)$/m);

        if (reactImportMatch) {
          const oldImport = reactImportMatch[0];

          // Add React to the import
          let newImport;
          if (oldImport.includes('import {')) {
            newImport = oldImport.replace('import {', 'import React, {');
          } else {
            // Should not happen, but handle it
            newImport = `import React from "react";\n${oldImport}`;
          }

          const newContent = content.replace(oldImport, newImport);
          fs.writeFileSync(file, newContent, 'utf-8');

          console.log(`✓ Fixed: ${file}`);
          fixedCount++;
        } else {
          skippedCount++;
        }
      } else {
        skippedCount++;
      }
    } catch (err) {
      console.error(`✗ Error processing ${file}:`, err.message);
    }
  }

  console.log(`\n✅ Complete!`);
  console.log(`   Fixed: ${fixedCount} files`);
  console.log(`   Skipped: ${skippedCount} files`);

} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
