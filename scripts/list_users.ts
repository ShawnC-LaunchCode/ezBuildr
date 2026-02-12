
import { users } from "@shared/schema";

import { db, initializeDatabase } from "../server/db";

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

main().catch((err: unknown) => {
    console.error("List users failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
});
