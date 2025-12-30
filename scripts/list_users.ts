
import { db, initializeDatabase } from "../server/db";
import { users } from "@shared/schema";
import { count, eq } from "drizzle-orm";

async function main() {
    await initializeDatabase();
    const allUsers = await db.select().from(users);
    console.log("ID | Email | Name | Role | Created At");
    console.log("-".repeat(80));
    allUsers.forEach(u => {
        console.log(`${u.id} | ${u.email} | ${u.firstName} ${u.lastName} | ${u.role} | ${u.createdAt}`);
    });
    process.exit(0);
}

main().catch((err) => {
    console.error("List users failed:", err);
    process.exit(1);
});
