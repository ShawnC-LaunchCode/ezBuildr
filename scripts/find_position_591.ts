import fs from 'fs';
import path from 'path';

const migrationsDir = './migrations';
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log('🔍 Searching for SELECT at position 591...\n');

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Check character positions 580-600 for SELECT
  const snippet = content.substring(580, 610);

  if (snippet.includes('SELECT')) {
    console.log(`\n📍 FOUND in ${file}:`);
    console.log(`Position 580-610: "${snippet}"`);

    // Show more context
    const lines = content.substring(0, 650).split('\n');
    console.log(`\nFirst ~650 characters (${lines.length} lines):`);
    lines.forEach((line, idx) => {
      console.log(`${idx + 1}: ${line}`);
    });
    console.log('---\n');
  }
}

console.log('✅ Search complete!');
