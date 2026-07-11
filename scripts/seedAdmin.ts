import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { users } from "@shared/schema";
import { logger } from "../server/logger";

async function seedAdmin() {
  try {
    const adminEmail = process.argv[2] || 'scooter4356@gmail.com';
    
    const result = await db.update(users)
      .set({ role: 'admin', tenantRole: 'owner' })
      .where(eq(users.email, adminEmail))
      .returning();
      
    if (result.length > 0) {
      logger.info(`Successfully promoted ${adminEmail} to admin/owner.`);
    } else {
      logger.warn(`User ${adminEmail} not found. Please ensure they have logged in at least once.`);
    }
  } catch (e) {
    logger.error({ error: e }, "Failed to enforce admin role");
  } finally {
    process.exit(0);
  }
}

void seedAdmin();
