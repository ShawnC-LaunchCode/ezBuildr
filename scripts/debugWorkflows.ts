#!/usr/bin/env tsx
/**
 * Debug script to check workflow data and schema
 */
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function debugWorkflows() {
  console.log("=== Workflow Debug Script ===\n");

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);

  try {
    // Check if workflows table exists and has correct columns
    console.log("1. Checking workflows table schema...");
    const tableInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'workflows'
      ORDER BY ordinal_position;
    `;
    console.log("Workflows table columns:");
    console.table(tableInfo);

    // Count total workflows
    console.log("\n2. Counting workflows...");
    const countResult = await sql`SELECT COUNT(*) as count FROM workflows`;
    console.log(`Total workflows in database: ${countResult[0]?.count || 0}`);

    // List all workflows with basic info
    console.log("\n3. Listing all workflows...");
    const allWorkflows = await sql`
      SELECT id, title, creator_id, status, created_at
      FROM workflows
      ORDER BY created_at DESC
      LIMIT 10
    `;

    console.log(`Found ${allWorkflows.length} workflows (showing max 10):`);
    allWorkflows.forEach((w) => {
      console.log(`  - ID: ${w.id}`);
      console.log(`    Title: ${w.title}`);
      console.log(`    Creator ID: ${w.creator_id}`);
      console.log(`    Status: ${w.status}`);
      console.log(`    Created: ${w.created_at}`);
      console.log();
    });

    // Check users table
    console.log("4. Checking users...");
    const allUsers = await sql`
      SELECT id, display_name, email
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
    `;

    console.log(`Found ${allUsers.length} users (showing max 5):`);
    allUsers.forEach((u) => {
      console.log(`  - ID: ${u.id}`);
      console.log(`    Name: ${u.display_name}`);
      console.log(`    Email: ${u.email}`);
      console.log();
    });

    // Check for schema issues mentioned in CLAUDE.md
    console.log("5. Checking for known schema issues...");
    try {
      const missingCols: string[] = [];

      // Check for required columns
      const requiredColumns = ['title', 'creator_id', 'owner_id', 'status'];
      const columnNames = tableInfo.map((r: any) => r.column_name);

      for (const col of requiredColumns) {
        if (!columnNames.includes(col)) {
          missingCols.push(col);
        }
      }

      if (missingCols.length > 0) {
        console.log(`⚠️  WARNING: Missing required columns: ${missingCols.join(', ')}`);
        console.log("   You may need to run migration 0024:");
        console.log("   npx tsx scripts/applyMigration0024.ts");
      } else {
        console.log("✓ All required columns present");
      }
    } catch (err) {
      console.error("Error checking schema:", err);
    }

  } catch (error: any) {
    console.error("Error during debug:", error.message || error);
  } finally {
    process.exit(0);
  }
}

debugWorkflows();
