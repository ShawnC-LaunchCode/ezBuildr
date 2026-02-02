#!/usr/bin/env tsx
import 'dotenv/config';
import { users } from '@shared/schema';

import { initializeDatabase, getDb } from '../server/db';

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
