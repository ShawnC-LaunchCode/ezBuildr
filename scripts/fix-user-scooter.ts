
import { dbInitPromise, db } from "../server/db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
    await dbInitPromise;
    const email = "scooter4356@gmail.com";
    console.log(`Fixing user: ${email}`);

    const [updatedUser] = await db.update(users)
        .set({
            authProvider: 'google',
            emailVerified: true,
            updatedAt: new Date()
        })
        .where(eq(users.email, email))
        .returning();

    if (updatedUser) {
        console.log("SUCCESS: User updated.");
        console.log(`New Auth Provider: ${updatedUser.authProvider}`);
        console.log(`Email Verified: ${updatedUser.emailVerified}`);
    } else {
        console.log("ERROR: User not found.");
    }

    process.exit(0);
}

main().catch(console.error);
