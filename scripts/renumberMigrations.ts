import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'migrations');

interface Migration {
  currentName: string;
  currentNumber: number;
  currentPath: string;
}

async function renumberMigrations() {
  console.log('🔢 Renumbering migration files...\n');

  // Read all migration files
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migration files\n`);

  // Parse current numbers and names
  const migrations: Migration[] = [];
  for (const file of files) {
    const match = file.match(/^(\d+)([a-z]?)_(.+)\.sql$/);
    if (match) {
      const number = parseInt(match[1], 10);
      const suffix = match[2]; // 'a', 'b', etc.
      migrations.push({
        currentName: file,
        currentNumber: number + (suffix ? (suffix.charCodeAt(0) - 96) * 0.1 : 0),
        currentPath: path.join(migrationsDir, file),
      });
    }
  }

  // Sort by current number
  migrations.sort((a, b) => a.currentNumber - b.currentNumber);

  // Show current state
  console.log('Current migration order:');
  console.log('─'.repeat(80));
  migrations.forEach((m, idx) => {
    console.log(`  ${String(idx).padStart(4, '0')} ← ${m.currentName}`);
  });
  console.log('─'.repeat(80));
  console.log();

  // Renumber sequentially
  const renames: Array<{ from: string; to: string }> = [];

  migrations.forEach((m, idx) => {
    const newNumber = String(idx).padStart(4, '0');
    const namePart = m.currentName.replace(/^\d+[a-z]?_/, '');
    const newName = `${newNumber}_${namePart}`;

    if (m.currentName !== newName) {
      renames.push({
        from: m.currentName,
        to: newName,
      });
    }
  });

  if (renames.length === 0) {
    console.log('✅ All migrations are already numbered correctly!');
    return;
  }

  console.log(`\n📝 Will rename ${renames.length} files:\n`);
  renames.forEach(r => {
    console.log(`  ${r.from}`);
    console.log(`    → ${r.to}\n`);
  });

  // Perform renames (use temp names first to avoid collisions)
  console.log('Renaming files...');

  // First pass: rename to temp names
  const tempRenames: Array<{ from: string; temp: string; to: string }> = [];
  for (const rename of renames) {
    const fromPath = path.join(migrationsDir, rename.from);
    const tempName = `temp_${Date.now()}_${rename.to}`;
    const tempPath = path.join(migrationsDir, tempName);

    fs.renameSync(fromPath, tempPath);
    tempRenames.push({
      from: rename.from,
      temp: tempName,
      to: rename.to,
    });
  }

  // Second pass: rename from temp to final names
  for (const rename of tempRenames) {
    const tempPath = path.join(migrationsDir, rename.temp);
    const toPath = path.join(migrationsDir, rename.to);

    fs.renameSync(tempPath, toPath);
    console.log(`  ✅ ${rename.from} → ${rename.to}`);
  }

  console.log(`\n✅ Successfully renumbered ${renames.length} migration files!`);
}

renumberMigrations().catch(console.error);
