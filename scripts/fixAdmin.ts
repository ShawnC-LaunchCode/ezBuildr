import dotenv from "dotenv";
dotenv.config();

import { eq } from "drizzle-orm";

import * as schema from "@shared/schema";
import { users } from "@shared/schema";

async function fixAdmin() {
  try {
    // Use Neon serverless driver
    const { Pool, neonConfig } = await import('@neondatabase/serverless');
    const ws = await import('ws');

    neonConfig.webSocketConstructor = ws.default;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const { drizzle } = await import('drizzle-orm/neon-serverless');
    const db = drizzle(pool, { schema });

    // First, list all users to see what we have
    console.log("📋 Current users in database:");
    const allUsers = await db.select().from(users);
    console.log(`Found ${allUsers.length} users:`);
    allUsers.forEach((u) => {
      console.log(`  - ID: ${u.id}`);
      console.log(`    Email: ${u.email}`);
      console.log(`    Role: ${u.role}`);
      console.log(`    Name: ${u.firstName} ${u.lastName}`);
      console.log(`    TenantId: ${u.tenantId}`);
      console.log("");
    });

    // Update the user with the specific ID we saw in the logs
    const userId = "116568744155653496130";
    const [updatedUser] = await db
      .update(users)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    if (updatedUser) {
      console.log(`✅ User ${updatedUser.email} (${updatedUser.id}) has been set as admin`);
      console.log(`   Role: ${updatedUser.role}`);
    } else {
      console.log(`❌ Could not update user with ID ${userId}`);
    }

    process.exit(0);
  } catch (error: unknown) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

fixAdmin();
