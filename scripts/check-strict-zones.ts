#!/usr/bin/env tsx

/**
 * check-strict-zones.ts
 *
 * Validates that TypeScript strict zones compile with strict mode settings.
 * This script ensures new code paths maintain high type safety standards.
 *
 * Usage:
 *   npm run check:strict-zones
 *   tsx scripts/check-strict-zones.ts
 *   tsx scripts/check-strict-zones.ts --verbose
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

interface StrictZone {
  pattern: string;
  description: string;
}

// Define strict zones that must comply with strict mode
const STRICT_ZONES: StrictZone[] = [
  {
    pattern: 'server/services/scripting/**/*',
    description: 'Custom Scripting System (Lifecycle & Document Hooks)'
  },
  {
    pattern: 'server/routes/lifecycleHooks.routes.ts',
    description: 'Lifecycle Hooks API Route'
  },
  {
    pattern: 'server/routes/documentHooks.routes.ts',
    description: 'Document Hooks API Route'
  },
  {
    pattern: 'server/repositories/LifecycleHookRepository.ts',
    description: 'Lifecycle Hook Repository'
  },
  {
    pattern: 'server/repositories/DocumentHookRepository.ts',
    description: 'Document Hook Repository'
  },
  {
    pattern: 'server/repositories/ScriptExecutionLogRepository.ts',
    description: 'Script Execution Log Repository'
  }
];

const STRICT_CONFIG_PATH = 'tsconfig.strict.json';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function fileExists(filepath: string): boolean {
  try {
    return fs.existsSync(filepath);
  } catch {
    return false;
  }
}

function globToRegex(pattern: string): RegExp {
  // Convert glob pattern to regex
  // **/* becomes .* (match any characters)
  // * becomes [^/]* (match any characters except /)
  const regexPattern = pattern
    .replace(/\*\*\/\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\./g, '\\.');
  return new RegExp(`^${regexPattern}$`);
}

function findFilesInZone(pattern: string): string[] {
  // Simple glob-like matcher
  const parts = pattern.split('/');
  const baseDir = path.join(ROOT_DIR, ...parts.slice(0, parts.indexOf('**') !== -1 ? parts.indexOf('**') : parts.length - 1));
  const isRecursive = pattern.includes('**');
  const filenamePattern = parts[parts.length - 1];

  const results: string[] = [];

  if (!fs.existsSync(baseDir)) {
    return [];
  }

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (isRecursive) {
          walk(fullPath);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        // Simple check: if pattern ends with * or matches filename
        if (filenamePattern === '*' || filenamePattern === '*.*' || entry.name === filenamePattern || (isRecursive && filenamePattern === '*.ts')) {
          const relative = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
          results.push(relative);
        } else if (isRecursive) {
          // Let tsc include handle complex globs, here we just want to verify files exist for the report
          // If the user passed server/services/scripting/**/*, we just return all TS files in that tree
          const relative = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
          results.push(relative);
        }
      }
    }
  }

  if (pattern.endsWith('routes.ts') || pattern.endsWith('Repository.ts')) {
    // Direct file path
    const fullPath = path.join(ROOT_DIR, pattern);
    if (fs.existsSync(fullPath)) {
      return [pattern];
    }
    return [];
  }

  walk(baseDir);
  return results;
}

function checkStrictCompliance(verbose: boolean = false): boolean {
  console.log('🔍 Checking TypeScript Strict Mode Compliance\n');
  console.log('='.repeat(60));

  // Check if strict config exists
  const strictConfigPath = path.join(ROOT_DIR, STRICT_CONFIG_PATH);
  if (!fileExists(strictConfigPath)) {
    console.error(`\n❌ Error: ${STRICT_CONFIG_PATH} not found`);
    console.error('   Run: npm run setup:strict-mode\n');
    return false;
  }

  let allPassed = true;
  let totalFiles = 0;

  // Check each strict zone
  for (const zone of STRICT_ZONES) {
    console.log(`\n📦 Zone: ${zone.description}`);
    console.log(`   Pattern: ${zone.pattern}`);

    const files = findFilesInZone(zone.pattern);
    totalFiles += files.length;

    if (files.length === 0) {
      console.log('   ⚠️  No files found in this zone');
      continue;
    }

    if (verbose) {
      console.log(`   Files (${files.length}):`);
      files.forEach(file => console.log(`     - ${file}`));
    } else {
      console.log(`   Files: ${files.length}`);
    }

    // Try to compile the zone with strict settings
    try {
      console.log('   Checking strict compliance...');

      execSync(
        `npx tsc --project ${STRICT_CONFIG_PATH} --noEmit`,
        {
          cwd: ROOT_DIR,
          stdio: verbose ? 'inherit' : 'pipe',
          encoding: 'utf-8'
        }
      );

      console.log('   ✅ PASSED - Strict mode compliant');
    } catch (error: any) {
      console.log('   ❌ FAILED - Strict mode violations detected');

      if (!verbose && error.stdout) {
        console.log('\n   Error output:');
        console.log('   ' + error.stdout.split('\n').slice(0, 10).join('\n   '));
        console.log('\n   Run with --verbose flag for full output');
      }

      allPassed = false;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   Total zones: ${STRICT_ZONES.length}`);
  console.log(`   Total files: ${totalFiles}`);
  console.log(`   Status: ${allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);

  if (!allPassed) {
    console.log('\n💡 To fix strict mode violations:');
    console.log('   1. Review the TypeScript errors above');
    console.log('   2. Add explicit type annotations');
    console.log('   3. Handle null/undefined cases');
    console.log('   4. Fix any implicit any types');
    console.log('   5. See docs/TYPESCRIPT_STRICT_MODE_MIGRATION.md for guidance');
  }

  console.log('');
  return allPassed;
}

function listStrictZones() {
  console.log('📋 Configured Strict Zones:\n');

  STRICT_ZONES.forEach((zone, index) => {
    console.log(`${index + 1}. ${zone.description}`);
    console.log(`   Pattern: ${zone.pattern}`);

    const files = findFilesInZone(zone.pattern);
    console.log(`   Files: ${files.length}`);

    if (files.length > 0 && files.length <= 10) {
      files.forEach(file => console.log(`     - ${file}`));
    } else if (files.length > 10) {
      files.slice(0, 5).forEach(file => console.log(`     - ${file}`));
      console.log(`     ... and ${files.length - 5} more`);
    }
    console.log('');
  });
}

// Main execution
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const listOnly = args.includes('--list') || args.includes('-l');
const help = args.includes('--help') || args.includes('-h');

if (help) {
  console.log(`
TypeScript Strict Mode Checker

Usage:
  tsx scripts/check-strict-zones.ts [options]

Options:
  --verbose, -v    Show detailed compilation output
  --list, -l       List all strict zones and their files
  --help, -h       Show this help message

Examples:
  tsx scripts/check-strict-zones.ts
  tsx scripts/check-strict-zones.ts --verbose
  tsx scripts/check-strict-zones.ts --list
`);
  process.exit(0);
}

if (listOnly) {
  listStrictZones();
  process.exit(0);
}

const success = checkStrictCompliance(verbose);
process.exit(success ? 0 : 1);
