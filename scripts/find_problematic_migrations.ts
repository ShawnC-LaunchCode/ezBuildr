import fs from 'fs';
import path from 'path';

const migrationsDir = './migrations';
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

console.log('🔍 Searching for problematic DO blocks...\n');

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Check for IF NOT EXISTS with SELECT inside DO blocks
  if (content.includes('DO $$') &&
      content.includes('IF NOT EXISTS') &&
      /IF NOT EXISTS\s*\(\s*SELECT.*FROM\s+pg_/.test(content)) {
    console.log(`❌ FOUND: ${file}`);

    // Show the problematic section
    const lines = content.split('\n');
    let inDoBlock = false;
    let blockStart = 0;

    lines.forEach((line, idx) => {
      if (line.includes('DO $$')) {
        inDoBlock = true;
        blockStart = idx;
      }
      if (inDoBlock && line.includes('IF NOT EXISTS') && line.includes('SELECT')) {
        console.log(`   Line ${idx + 1}: ${line.trim()}`);
      }
      if (line.includes('END $$')) {
        inDoBlock = false;
      }
    });
    console.log('');
  }
}

console.log('✅ Search complete!');
