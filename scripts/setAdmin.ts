import dotenv from "dotenv";
dotenv.config();

import { eq } from "drizzle-orm";

import * as schema from "@shared/schema";
import { users } from "@shared/schema";

async function setAdmin() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: npm run set-admin <email>");
    process.exit(1);
  }

  try {
    // Detect if we're using Neon serverless or local PostgreSQL
    const isNeonDatabase = process.env.DATABASE_URL?.includes('neon.tech') ||
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

    const [updatedUser] = await db
      .update(users)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(eq(users.email, email))
      .returning();

    if (!updatedUser) {
      console.error(`❌ User with email ${email} not found`);
      process.exit(1);
    }

    console.log(`✅ User ${updatedUser.email} (${updatedUser.id}) has been set as admin`);
    console.log(`   Name: ${updatedUser.firstName} ${updatedUser.lastName}`);
    console.log(`   Role: ${updatedUser.role}`);
    process.exit(0);
  } catch (error: unknown) {
    console.error("❌ Error setting admin:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

setAdmin();
