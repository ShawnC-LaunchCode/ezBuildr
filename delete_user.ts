import { db, initializeDatabase } from "./server/db";
import { users } from "./shared/schema";
import { eq, sql } from "drizzle-orm";

async function run() {
  await initializeDatabase();
  const email = 'junkscooter4356@gmail.com';
  console.log(`Looking for user with email: ${email}`);
  
  const userList = await db.select().from(users).where(eq(users.email, email));
  if (userList.length === 0) {
    console.log("User not found.");
    process.exit(0);
  }

  const user = userList[0];
  console.log(`Found user: ${user.id}`);

  try {
    console.log("Deleting workflow_versions...");
    await db.execute(sql`DELETE FROM workflow_versions WHERE created_by = ${user.id}`);
    
    console.log("Deleting workflows...");
    await db.execute(sql`DELETE FROM workflows WHERE owner_id = ${user.id} OR creator_id = ${user.id}`);

    console.log("Deleting audit logs...");
    await db.execute(sql`DELETE FROM audit_logs WHERE user_id = ${user.id}`);

    console.log("Deleting password reset tokens...");
    await db.execute(sql`DELETE FROM password_reset_tokens WHERE user_id = ${user.id}`);

    console.log("Deleting user credentials...");
    await db.execute(sql`DELETE FROM user_credentials WHERE user_id = ${user.id}`);

    console.log("Deleting user...");
    await db.delete(users).where(eq(users.id, user.id));
    console.log("Successfully deleted user and cascaded data.");
  } catch (error) {
    console.error("Failed to delete user:", error);
  }
  process.exit(0);
}

run();
