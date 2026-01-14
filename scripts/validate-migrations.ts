#!/usr/bin/env tsx

/**
 * Migration Validation Script
 *
 * Validates database migrations for:
 * - Sequential numbering
 * - Naming consistency
 * - Potential conflicts (same table/column modifications)
 * - Schema consistency with migration history
 * - Missing or duplicate migrations
 *
 * Usage: npm run db:validate
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  file?: string;
  suggestion?: string;
}

interface MigrationFile {
  filename: string;
  fullPath: string;
  number?: number;
  name: string;
  isNumbered: boolean;
  content: string;
}

interface TableModification {
  table: string;
  operation: 'CREATE' | 'ALTER' | 'DROP';
  details: string;
  migration: string;
}

class MigrationValidator {
  private migrationsDir: string;
  private metaDir: string;
  private issues: ValidationIssue[] = [];
  private migrations: MigrationFile[] = [];
  private tableModifications: TableModification[] = [];

  constructor() {
    const projectRoot = path.resolve(process.cwd());
    this.migrationsDir = path.join(projectRoot, 'migrations');
    this.metaDir = path.join(projectRoot, 'migrations', 'meta');
  }

  /**
   * Run all validations
   */
  async validate(): Promise<void> {
    console.log(`${colors.bright}${colors.cyan}Database Migration Validator${colors.reset}\n`);
    console.log(`Migrations Directory: ${this.migrationsDir}\n`);

    // Load migrations
    this.loadMigrations();

    // Run validations
    this.validateMigrationNaming();
    this.validateSequentialNumbering();
    this.validateFileStructure();
    this.validateMetadataConsistency();
    this.validateTableModifications();
    this.detectConflicts();
    this.validateJournalMetadata();

    // Print report
    this.printReport();

    // Exit with error code if errors found
    const hasErrors = this.issues.some(issue => issue.severity === 'error');
    if (hasErrors) {
      process.exit(1);
    }
  }

  /**
   * Load all migration files
   */
  private loadMigrations(): void {
    const files = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const filename of files) {
      const fullPath = path.join(this.migrationsDir, filename);
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Parse migration number if present
      const match = filename.match(/^(\d{4})_(.+)\.sql$/);
      const isNumbered = !!match;
      const number = match ? parseInt(match[1], 10) : undefined;
      const name = match ? match[2] : filename.replace('.sql', '');

      this.migrations.push({
        filename,
        fullPath,
        number,
        name,
        isNumbered,
        content,
      });
    }

    console.log(`${colors.green}✓${colors.reset} Loaded ${this.migrations.length} migration files\n`);
  }

  /**
   * Validate migration naming convention
   */
  private validateMigrationNaming(): void {
    console.log(`${colors.bright}Checking naming conventions...${colors.reset}`);

    const numberedMigrations = this.migrations.filter(m => m.isNumbered);
    const manualMigrations = this.migrations.filter(m => !m.isNumbered);

    // Check numbered migrations
    for (const migration of numberedMigrations) {
      // Check for generic auto-generated names
      if (migration.name.match(/^[a-z]+_[a-z]+$/)) {
        this.issues.push({
          severity: 'warning',
          category: 'naming',
          message: `Auto-generated name detected: ${migration.filename}`,
          file: migration.filename,
          suggestion: 'Consider renaming to a descriptive name like "add_feature_name"',
        });
      }

      // Check for proper snake_case
      if (!migration.name.match(/^[a-z0-9_]+$/)) {
        this.issues.push({
          severity: 'warning',
          category: 'naming',
          message: `Migration name should be snake_case: ${migration.filename}`,
          file: migration.filename,
          suggestion: 'Use lowercase letters, numbers, and underscores only',
        });
      }
    }

    // Report manual migrations
    if (manualMigrations.length > 0) {
      this.issues.push({
        severity: 'info',
        category: 'naming',
        message: `Found ${manualMigrations.length} manual migrations (not tracked by Drizzle)`,
        suggestion: 'Manual migrations: ' + manualMigrations.map(m => m.filename).join(', '),
      });
    }

    console.log(`${colors.green}✓${colors.reset} Naming convention check complete\n`);
  }

  /**
   * Validate sequential numbering
   */
  private validateSequentialNumbering(): void {
    console.log(`${colors.bright}Checking sequential numbering...${colors.reset}`);

    const numberedMigrations = this.migrations
      .filter(m => m.isNumbered && m.number !== undefined)
      .sort((a, b) => a.number! - b.number!);

    if (numberedMigrations.length === 0) {
      this.issues.push({
        severity: 'warning',
        category: 'numbering',
        message: 'No numbered migrations found',
      });
      return;
    }

    // Check for gaps
    for (let i = 0; i < numberedMigrations.length - 1; i++) {
      const current = numberedMigrations[i].number!;
      const next = numberedMigrations[i + 1].number!;

      if (next - current > 1) {
        this.issues.push({
          severity: 'warning',
          category: 'numbering',
          message: `Gap in migration sequence: ${current} → ${next}`,
          suggestion: `Missing migrations between ${current} and ${next}`,
        });
      }
    }

    // Check for duplicates
    const numbers = numberedMigrations.map(m => m.number!);
    const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);

    if (duplicates.length > 0) {
      const uniqueDuplicates = [...new Set(duplicates)];
      for (const num of uniqueDuplicates) {
        const dupeFiles = numberedMigrations
          .filter(m => m.number === num)
          .map(m => m.filename);

        this.issues.push({
          severity: 'error',
          category: 'numbering',
          message: `Duplicate migration number ${num.toString().padStart(4, '0')}`,
          suggestion: `Files: ${dupeFiles.join(', ')}. Rename one to the next available number.`,
        });
      }
    }

    // Check for non-sequential starts
    const firstNumber = numberedMigrations[0].number!;
    if (firstNumber !== 0) {
      this.issues.push({
        severity: 'info',
        category: 'numbering',
        message: `Migration numbering starts at ${firstNumber.toString().padStart(4, '0')} (expected 0000)`,
      });
    }

    console.log(`${colors.green}✓${colors.reset} Sequential numbering check complete\n`);
  }

  /**
   * Validate file structure
   */
  private validateFileStructure(): void {
    console.log(`${colors.bright}Checking file structure...${colors.reset}`);

    for (const migration of this.migrations) {
      const { content, filename } = migration;

      // Check for statement breakpoints
      if (!content.includes('--> statement-breakpoint') && content.length > 0) {
        this.issues.push({
          severity: 'warning',
          category: 'structure',
          message: `Missing statement breakpoints: ${filename}`,
          file: filename,
          suggestion: 'Add "--> statement-breakpoint" between SQL statements for proper parsing',
        });
      }

      // Check for empty migrations
      const sqlStatements = content
        .split('--> statement-breakpoint')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--'));

      if (sqlStatements.length === 0) {
        this.issues.push({
          severity: 'warning',
          category: 'structure',
          message: `Empty migration file: ${filename}`,
          file: filename,
        });
      }

      // Check for documentation comments
      if (!content.includes('--') || !content.match(/--.*Migration:/i)) {
        this.issues.push({
          severity: 'info',
          category: 'structure',
          message: `Missing documentation comments: ${filename}`,
          file: filename,
          suggestion: 'Add descriptive comments explaining what this migration does',
        });
      }
    }

    console.log(`${colors.green}✓${colors.reset} File structure check complete\n`);
  }

  /**
   * Validate metadata consistency
   */
  private validateMetadataConsistency(): void {
    console.log(`${colors.bright}Checking metadata consistency...${colors.reset}`);

    // Check if meta directory exists
    if (!fs.existsSync(this.metaDir)) {
      this.issues.push({
        severity: 'error',
        category: 'metadata',
        message: 'Migrations meta directory not found',
        suggestion: 'Run "npm run db:generate" to create metadata',
      });
      return;
    }

    // Check journal file
    const journalPath = path.join(this.metaDir, '_journal.json');
    if (!fs.existsSync(journalPath)) {
      this.issues.push({
        severity: 'error',
        category: 'metadata',
        message: 'Migration journal not found',
        suggestion: 'Run "npm run db:generate" to create journal',
      });
      return;
    }

    console.log(`${colors.green}✓${colors.reset} Metadata consistency check complete\n`);
  }

  /**
   * Validate journal metadata
   */
  private validateJournalMetadata(): void {
    console.log(`${colors.bright}Checking journal metadata...${colors.reset}`);

    const journalPath = path.join(this.metaDir, '_journal.json');
    if (!fs.existsSync(journalPath)) {
      return; // Already reported in validateMetadataConsistency
    }

    try {
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
      const entries = journal.entries || [];

      // Check if all numbered migrations are in journal
      const numberedMigrations = this.migrations.filter(m => m.isNumbered);
      const journalTags = new Set(entries.map((e: any) => e.tag));

      for (const migration of numberedMigrations) {
        const expectedTag = migration.filename.replace('.sql', '');
        if (!journalTags.has(expectedTag)) {
          this.issues.push({
            severity: 'warning',
            category: 'metadata',
            message: `Migration not in journal: ${migration.filename}`,
            file: migration.filename,
            suggestion: 'Run "npm run db:generate" to update journal',
          });
        }
      }

      // Check for journal entries without files
      for (const entry of entries) {
        const expectedFile = `${entry.tag}.sql`;
        const exists = this.migrations.some(m => m.filename === expectedFile);
        if (!exists) {
          this.issues.push({
            severity: 'warning',
            category: 'metadata',
            message: `Journal entry without migration file: ${expectedFile}`,
            suggestion: 'Remove journal entry or create missing migration file',
          });
        }
      }

      console.log(`${colors.green}✓${colors.reset} Journal metadata check complete\n`);
    } catch (error) {
      this.issues.push({
        severity: 'error',
        category: 'metadata',
        message: `Failed to parse journal: ${error}`,
      });
    }
  }

  /**
   * Parse and track table modifications
   */
  private validateTableModifications(): void {
    console.log(`${colors.bright}Analyzing table modifications...${colors.reset}`);

    for (const migration of this.migrations) {
      // Extract CREATE TABLE statements
      const createMatches = migration.content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi);
      for (const match of createMatches) {
        this.tableModifications.push({
          table: match[1],
          operation: 'CREATE',
          details: 'Table creation',
          migration: migration.filename,
        });
      }

      // Extract ALTER TABLE statements
      const alterMatches = migration.content.matchAll(/ALTER\s+TABLE\s+"?(\w+)"?\s+(.*?)(?:--> statement-breakpoint|$)/gis);
      for (const match of alterMatches) {
        const table = match[1];
        const details = match[2].trim().split('\n')[0].substring(0, 100);
        this.tableModifications.push({
          table,
          operation: 'ALTER',
          details,
          migration: migration.filename,
        });
      }

      // Extract DROP TABLE statements
      const dropMatches = migration.content.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?/gi);
      for (const match of dropMatches) {
        this.tableModifications.push({
          table: match[1],
          operation: 'DROP',
          details: 'Table deletion',
          migration: migration.filename,
        });
      }
    }

    console.log(`${colors.green}✓${colors.reset} Table modification analysis complete\n`);
  }

  /**
   * Detect potential conflicts
   */
  private detectConflicts(): void {
    console.log(`${colors.bright}Detecting conflicts...${colors.reset}`);

    // Group modifications by table
    const tableGroups = new Map<string, TableModification[]>();
    for (const mod of this.tableModifications) {
      const existing = tableGroups.get(mod.table) || [];
      existing.push(mod);
      tableGroups.set(mod.table, existing);
    }

    // Check for conflicting operations
    for (const [table, modifications] of tableGroups) {
      // Multiple ALTERs in different migrations
      const alters = modifications.filter(m => m.operation === 'ALTER');
      if (alters.length > 1) {
        const migrations = [...new Set(alters.map(m => m.migration))];
        if (migrations.length > 1) {
          this.issues.push({
            severity: 'info',
            category: 'conflicts',
            message: `Table "${table}" modified in ${migrations.length} migrations`,
            suggestion: `Migrations: ${migrations.join(', ')}`,
          });
        }
      }

      // CREATE after DROP
      const creates = modifications.filter(m => m.operation === 'CREATE');
      const drops = modifications.filter(m => m.operation === 'DROP');
      if (creates.length > 0 && drops.length > 0) {
        this.issues.push({
          severity: 'warning',
          category: 'conflicts',
          message: `Table "${table}" was dropped and recreated`,
          suggestion: 'Verify this is intentional and data migration is handled',
        });
      }

      // Multiple CREATEs
      if (creates.length > 1) {
        this.issues.push({
          severity: 'error',
          category: 'conflicts',
          message: `Table "${table}" created multiple times`,
          suggestion: `Migrations: ${creates.map(c => c.migration).join(', ')}`,
        });
      }
    }

    console.log(`${colors.green}✓${colors.reset} Conflict detection complete\n`);
  }

  /**
   * Print validation report
   */
  private printReport(): void {
    console.log(`\n${colors.bright}${colors.cyan}====================================`);
    console.log(`Validation Report`);
    console.log(`====================================${colors.reset}\n`);

    // Summary statistics
    console.log(`${colors.bright}Summary:${colors.reset}`);
    console.log(`  Total migrations: ${this.migrations.length}`);
    console.log(`  Numbered migrations: ${this.migrations.filter(m => m.isNumbered).length}`);
    console.log(`  Manual migrations: ${this.migrations.filter(m => !m.isNumbered).length}`);
    console.log(`  Tables modified: ${new Set(this.tableModifications.map(m => m.table)).size}`);
    console.log(`  Total modifications: ${this.tableModifications.length}\n`);

    // Issues by severity
    const errors = this.issues.filter(i => i.severity === 'error');
    const warnings = this.issues.filter(i => i.severity === 'warning');
    const info = this.issues.filter(i => i.severity === 'info');

    if (errors.length > 0) {
      console.log(`${colors.bright}${colors.red}Errors (${errors.length}):${colors.reset}`);
      for (const issue of errors) {
        this.printIssue(issue);
      }
      console.log();
    }

    if (warnings.length > 0) {
      console.log(`${colors.bright}${colors.yellow}Warnings (${warnings.length}):${colors.reset}`);
      for (const issue of warnings) {
        this.printIssue(issue);
      }
      console.log();
    }

    if (info.length > 0) {
      console.log(`${colors.bright}${colors.blue}Info (${info.length}):${colors.reset}`);
      for (const issue of info) {
        this.printIssue(issue);
      }
      console.log();
    }

    // Final status
    console.log(`${colors.bright}${colors.cyan}====================================${colors.reset}\n`);

    if (errors.length === 0 && warnings.length === 0) {
      console.log(`${colors.green}${colors.bright}✓ All validations passed!${colors.reset}\n`);
    } else if (errors.length === 0) {
      console.log(`${colors.yellow}${colors.bright}⚠ Validation completed with warnings${colors.reset}\n`);
    } else {
      console.log(`${colors.red}${colors.bright}✗ Validation failed with errors${colors.reset}\n`);
    }

    console.log(`Total issues: ${this.issues.length} (${errors.length} errors, ${warnings.length} warnings, ${info.length} info)\n`);
  }

  /**
   * Print a single issue
   */
  private printIssue(issue: ValidationIssue): void {
    const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
    const color = issue.severity === 'error' ? colors.red : issue.severity === 'warning' ? colors.yellow : colors.blue;

    console.log(`  ${color}${icon}${colors.reset} [${issue.category}] ${issue.message}`);
    if (issue.file) {
      console.log(`    File: ${issue.file}`);
    }
    if (issue.suggestion) {
      console.log(`    ${colors.cyan}→${colors.reset} ${issue.suggestion}`);
    }
  }
}

// Run validator
const validator = new MigrationValidator();
validator.validate().catch((error) => {
  console.error(`${colors.red}Validation error:${colors.reset}`, error);
  process.exit(1);
});
