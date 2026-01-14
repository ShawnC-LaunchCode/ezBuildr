#!/usr/bin/env node

/**
 * Script to add @vitest-environment jsdom to UI test files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Find all test files in tests/ui directory
const findCommand = `find tests/ui -name "*.test.tsx" -type f`;

try {
  const files = execSync(findCommand, { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(Boolean);

  console.log(`Found ${files.length} .tsx test files in tests/ui`);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');

      // Check if file already has @vitest-environment jsdom
      if (content.includes('@vitest-environment jsdom')) {
        skippedCount++;
        continue;
      }

      // Add the environment comment at the top
      let newContent;
      if (content.startsWith('/**') || content.startsWith('/*')) {
        // If starts with comment block, add after it
        const commentEnd = content.indexOf('*/') + 2;
        newContent =
          content.substring(0, commentEnd) +
          '\n\n/**\n * @vitest-environment jsdom\n */\n' +
          content.substring(commentEnd);
      } else if (content.startsWith('//')) {
        // If starts with single-line comments, add before them
        newContent = '/**\n * @vitest-environment jsdom\n */\n\n' + content;
      } else {
        // If starts with imports, add at the very top
        newContent = '/**\n * @vitest-environment jsdom\n */\n\n' + content;
      }

      fs.writeFileSync(file, newContent, 'utf-8');
      console.log(`✓ Fixed: ${file}`);
      fixedCount++;
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
