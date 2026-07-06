import { db, initializeDatabase } from "./server/db";
import { users } from "./shared/schema";
import { eq } from "drizzle-orm";

async function run() {
  await initializeDatabase();
  const userId = '1b93ea71-f491-40b5-b17a-0db831691dbe';
  const res = await db.select().from(users).where(eq(users.id, userId));
  console.log("User:", res[0]?.email);
  process.exit(0);
}

run();
