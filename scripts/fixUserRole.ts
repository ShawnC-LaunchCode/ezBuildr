/**
 * Fix user role in development
 * Sets the user's tenant_role to 'owner' if it's null
 */

import dotenv from 'dotenv';
dotenv.config();

import * as schema from '@shared/schema';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function fixUserRole() {
  const userId = '116568744155653496130'; // Your Google user ID

  try {
    // Detect if we're using Neon serverless or local PostgreSQL
    const isNeonDatabase =
      process.env.DATABASE_URL?.includes('neon.tech') ||
      process.env.DATABASE_URL?.includes('neon.co');

    let db: any;

    if (isNeonDatabase) {
      // Use Neon serverless driver
      const { Pool, neonConfig } = await import('@neondatabase/serverless');
      const ws = await import('ws');

      neonConfig.webSocketConstructor = ws.default;
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });

      const { drizzle } = await import('drizzle-orm/neon-serverless');
      db = drizzle(pool as any, { schema });
    } else {
      // Use standard PostgreSQL driver
      const pg = await import('pg');
      const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });

      const { drizzle } = await import('drizzle-orm/node-postgres');
      db = drizzle(pool as any, { schema });
    }

    // Get current user
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      console.error('❌ User not found');
      process.exit(1);
    }

    console.log('Current user:', {
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      tenantRole: user.tenantRole,
    });

    if (!user.tenantRole) {
      console.log('Setting tenant_role to "owner"...');
      await db.update(users).set({ tenantRole: 'owner' }).where(eq(users.id, userId));

      console.log('✅ User role updated to "owner"');
    } else {
      console.log(`✅ User already has role: ${user.tenantRole}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixUserRole();
