/**
 * Archive Survey Data Script
 *
 * This script exports all legacy survey system data to JSON archives
 * before the survey tables are dropped from the database.
 *
 * Archived data location: archives/surveys/{timestamp}/
 *
 * Usage: npx tsx scripts/archive-survey-data.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import { surveys, surveyPages, questions, loopGroupSubquestions, conditionalRules, responses, answers, files, analyticsEvents } from '../shared/schema';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

interface ArchiveMetadata {
  timestamp: string;
  archiveDate: string;
  tablesArchived: string[];
  recordCounts: Record<string, number>;
  version: string;
  notes: string;
}

async function createArchiveDirectory(timestamp: string): Promise<string> {
  const archiveDir = path.join(process.cwd(), 'archives', 'surveys', timestamp);
  await fs.mkdir(archiveDir, { recursive: true });
  console.log(`📁 Created archive directory: ${archiveDir}`);
  return archiveDir;
}

async function writeJsonFile(dir: string, filename: string, data: any): Promise<void> {
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✅ Wrote ${filename} (${data.length || 0} records)`);
}

async function archiveSurveyData() {
  console.log('🗄️  Starting Survey Data Archive Process\n');

  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const archiveDir = await createArchiveDirectory(timestamp);

  const metadata: ArchiveMetadata = {
    timestamp,
    archiveDate: new Date().toISOString(),
    tablesArchived: [],
    recordCounts: {},
    version: '1.7.0',
    notes: 'Legacy survey system data archived before table removal (Migration 0062)'
  };

  try {
    // Archive surveys
    console.log('\n📊 Archiving surveys...');
    const surveysData = await db.select().from(surveys);
    await writeJsonFile(archiveDir, 'surveys.json', surveysData);
    metadata.tablesArchived.push('surveys');
    metadata.recordCounts.surveys = surveysData.length;

    // Archive survey pages
    console.log('📄 Archiving survey_pages...');
    const surveyPagesData = await db.select().from(surveyPages);
    await writeJsonFile(archiveDir, 'survey_pages.json', surveyPagesData);
    metadata.tablesArchived.push('survey_pages');
    metadata.recordCounts.survey_pages = surveyPagesData.length;

    // Archive questions
    console.log('❓ Archiving questions...');
    const questionsData = await db.select().from(questions);
    await writeJsonFile(archiveDir, 'questions.json', questionsData);
    metadata.tablesArchived.push('questions');
    metadata.recordCounts.questions = questionsData.length;

    // Archive loop group subquestions
    console.log('🔄 Archiving loop_group_subquestions...');
    const loopSubquestionsData = await db.select().from(loopGroupSubquestions);
    await writeJsonFile(archiveDir, 'loop_group_subquestions.json', loopSubquestionsData);
    metadata.tablesArchived.push('loop_group_subquestions');
    metadata.recordCounts.loop_group_subquestions = loopSubquestionsData.length;

    // Archive conditional rules
    console.log('📏 Archiving conditional_rules...');
    const conditionalRulesData = await db.select().from(conditionalRules);
    await writeJsonFile(archiveDir, 'conditional_rules.json', conditionalRulesData);
    metadata.tablesArchived.push('conditional_rules');
    metadata.recordCounts.conditional_rules = conditionalRulesData.length;

    // Archive responses
    console.log('📝 Archiving responses...');
    const responsesData = await db.select().from(responses);
    await writeJsonFile(archiveDir, 'responses.json', responsesData);
    metadata.tablesArchived.push('responses');
    metadata.recordCounts.responses = responsesData.length;

    // Archive answers
    console.log('💬 Archiving answers...');
    const answersData = await db.select().from(answers);
    await writeJsonFile(archiveDir, 'answers.json', answersData);
    metadata.tablesArchived.push('answers');
    metadata.recordCounts.answers = answersData.length;

    // Archive files
    console.log('📎 Archiving files...');
    const filesData = await db.select().from(files);
    await writeJsonFile(archiveDir, 'files.json', filesData);
    metadata.tablesArchived.push('files');
    metadata.recordCounts.files = filesData.length;

    // Archive analytics events
    console.log('📈 Archiving analytics_events...');
    const analyticsEventsData = await db.select().from(analyticsEvents);
    await writeJsonFile(archiveDir, 'analytics_events.json', analyticsEventsData);
    metadata.tablesArchived.push('analytics_events');
    metadata.recordCounts.analytics_events = analyticsEventsData.length;

    // Write metadata file
    console.log('\n📋 Writing metadata...');
    await writeJsonFile(archiveDir, 'metadata.json', metadata);

    // Create README for the archive
    const readme = `# Survey System Data Archive

**Archive Date:** ${metadata.archiveDate}
**Version:** ${metadata.version}

## Overview

This archive contains all data from the legacy survey system before it was removed from ezBuildr.
The survey system was deprecated in November 2025 and replaced with the workflow system.

## Tables Archived

${metadata.tablesArchived.map(table => `- **${table}**: ${metadata.recordCounts[table]} records`).join('\n')}

**Total Records:** ${Object.values(metadata.recordCounts).reduce((a, b) => a + b, 0)}

## Files

- \`surveys.json\` - Survey definitions
- \`survey_pages.json\` - Survey pages/sections
- \`questions.json\` - Question definitions
- \`loop_group_subquestions.json\` - Loop group subquestions
- \`conditional_rules.json\` - Conditional logic rules
- \`responses.json\` - Survey responses
- \`answers.json\` - Individual answers
- \`files.json\` - File upload metadata
- \`analytics_events.json\` - Analytics tracking data
- \`metadata.json\` - Archive metadata

## Data Format

All files are in JSON format with each record represented as an object.
Dates are stored in ISO 8601 format.
JSONB columns are preserved as nested objects.

## Accessing Historical Data

To query this archived data, you can:

1. Import the JSON files into a database for analysis
2. Use Node.js/TypeScript to parse and query the JSON files
3. Use jq or similar tools for command-line queries

Example (using jq):
\`\`\`bash
# List all surveys
cat surveys.json | jq '.[] | {id, title, status}'

# Count responses per survey
cat responses.json | jq 'group_by(.surveyId) | map({surveyId: .[0].surveyId, count: length})'
\`\`\`

## Migration Information

This archive was created as part of migration \`0062_archive_and_remove_surveys.sql\`.
The survey tables were removed to complete the transition to the workflow system.

## Support

If you need to access or restore this data, contact the development team.
`;

    await fs.writeFile(path.join(archiveDir, 'README.md'), readme, 'utf-8');
    console.log('✅ Wrote README.md');

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ ARCHIVE COMPLETE');
    console.log('='.repeat(60));
    console.log(`\n📁 Archive location: ${archiveDir}`);
    console.log(`\n📊 Summary:`);
    for (const [table, count] of Object.entries(metadata.recordCounts)) {
      console.log(`   - ${table.padEnd(30)} ${count.toString().padStart(6)} records`);
    }
    console.log(`\n   Total: ${Object.values(metadata.recordCounts).reduce((a, b) => a + b, 0)} records archived`);
    console.log('\n💡 You can now run the migration to drop survey tables.');

  } catch (error) {
    console.error('\n❌ Error during archive:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the archive
archiveSurveyData()
  .then(() => {
    console.log('\n✨ Archive process completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Archive process failed:', error);
    process.exit(1);
  });
