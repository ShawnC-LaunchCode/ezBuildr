
import { eq } from "drizzle-orm";

import { users } from "@shared/schema";

import { dbInitPromise, db } from "../server/db";

async function main() {
    await dbInitPromise;
    const email = "scooter4356@gmail.com";
    console.log(`Checking user: ${email}`);

    const user = await db.query.users.findFirst({
        where: eq(users.email, email)
    });

    if (!user) {
        console.log("User NOT FOUND.");
    } else {
        console.log("User details:");
        console.log(JSON.stringify(user, null, 2));
    }
    process.exit(0);
}

main().catch((error: unknown) => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
});
