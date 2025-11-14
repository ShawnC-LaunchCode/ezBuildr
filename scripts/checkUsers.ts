#!/usr/bin/env tsx
/**
 * Check users in the database
 */
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function checkUsers() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);

  try {
    // Check users table schema
    console.log("1. Checking users table schema...");
    const userColumns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `;
    console.log("Users table columns:", userColumns.map(c => c.column_name).join(', '));

    // List all users
    console.log("\n2. Listing all users...");
    const users = await sql`SELECT * FROM users`;

    console.log(`Found ${users.length} users:\n`);
    users.forEach((u) => {
      console.log(`User ID: ${u.id}`);
      // Print all properties dynamically
      Object.keys(u).forEach(key => {
        if (key !== 'id') {
          console.log(`  ${key}: ${u[key]}`);
        }
      });
      console.log();
    });

  } catch (error: any) {
    console.error("Error:", error.message || error);
  } finally {
    process.exit(0);
  }
}

checkUsers();
