#!/usr/bin/env tsx
import 'dotenv/config';
import { initializeDatabase, getDb } from '../server/db';
import { users } from '@shared/schema';

async function checkUsers() {
  await initializeDatabase();
  const db = getDb();
  const allUsers = await db.select().from(users);
  console.log('Users in database:');
  allUsers.forEach(u => {
    console.log(`  - ${u.email}: tenantId=${u.tenantId || 'NULL'}`);
  });
  process.exit(0);
}

checkUsers();
