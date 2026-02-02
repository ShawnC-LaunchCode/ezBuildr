
import { eq, ne } from "drizzle-orm";

import { users } from "@shared/schema";

import { db, initializeDatabase } from "../server/db";

async function main() {
    await initializeDatabase();

    const targetEmail = 'scooter4356@gmail.com';

    try {
        console.log("Starting bulk role update...");

        // 1. Verify current state
        const allUsers = await db.select().from(users);
        const initialAdmins = allUsers.filter(u => u.role === 'admin');
        const initialCreators = allUsers.filter(u => u.role === 'creator');

        console.log(`Initial State: ${allUsers.length} users total.`);
        console.log(`- Admins: ${initialAdmins.length}`);
        console.log(`- Creators: ${initialCreators.length}`);

        const targetUser = allUsers.find(u => u.email === targetEmail);
        if (targetUser) {
            console.log(`Exception User (${targetEmail}) found. Current role: ${targetUser.role}`);
        } else {
            console.warn(`WARNING: Exception User (${targetEmail}) NOT found!`);
        }

        // 2. Perform Update
        console.log("\nUpdating roles...");
        const result = await db.update(users)
            .set({ role: 'creator' })
            .where(ne(users.email, targetEmail))
            .returning();

        console.log(`Updated ${result.length} users to 'creator' role.`);

        // 3. Verify Update
        const finalUsers = await db.select().from(users);
        const finalAdmins = finalUsers.filter(u => u.role === 'admin');
        const finalCreators = finalUsers.filter(u => u.role === 'creator');

        console.log(`\nFinal State:`);
        console.log(`- Admins: ${finalAdmins.length}`);
        console.log(`- Creators: ${finalCreators.length}`);

        const finalTargetUser = finalUsers.find(u => u.email === targetEmail);
        if (finalTargetUser?.role === 'admin') {
            console.log(`SUCCESS: ${targetEmail} is still an admin.`);
        } else {
            console.error(`ERROR: ${targetEmail} is NOT an admin! Role: ${finalTargetUser?.role}`);
        }

        if (finalAdmins.length === 1 && finalAdmins[0].email === targetEmail) {
            console.log("SUCCESS: Only the target user is an admin.");
        } else {
            console.log("Note: There might be other admins if the exception logic failed, or if the target user wasn't the only one excluded (which shouldn't happen with this query).");
            console.log("Admins:", finalAdmins.map(u => u.email));
        }

    } catch (error) {
        console.error("Script error:", error);
    } finally {
        process.exit(0);
    }
}

main();
