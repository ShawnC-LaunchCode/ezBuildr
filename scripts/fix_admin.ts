import dotenv from "dotenv";
dotenv.config();
import { db, initializeDatabase } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  await initializeDatabase();
  
  const userList = await db.select().from(users).where(eq(users.email, 'scooter4356@gmail.com'));
  if (userList.length > 0) {
    const u = userList[0];
    console.log(`Current role for ${u.email}:`, u.role);
    
    if (u.role !== 'admin') {
      await db.update(users).set({ role: 'admin' }).where(eq(users.email, 'scooter4356@gmail.com'));
      console.log(`Successfully updated ${u.email} to admin!`);
    } else {
      console.log(`${u.email} is ALREADY an admin!`);
    }
  } else {
    console.log("User not found!");
  }
}

main().catch(console.error).finally(() => process.exit(0));
