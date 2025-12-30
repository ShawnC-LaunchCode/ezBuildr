
import { db } from "../server/db";
import { users, userCredentials } from "@shared/schema";
import { authService } from "../server/services/AuthService";
import { userCredentialsRepository } from "../server/repositories/UserCredentialsRepository";
import { userRepository } from "../server/repositories/UserRepository";
import { eq } from "drizzle-orm";

async function main() {
    const { dbInitPromise } = await import("../server/db");
    await dbInitPromise;

    const email = "debug_user@example.com";
    const password = "debugPassword123!";
    const firstName = "Debug";
    const lastName = "User";

    console.log(`Creating debug user: ${email}`);

    // Cleanup existing
    const existing = await userRepository.findByEmail(email);
    if (existing) {
        console.log("Removing existing debug user...");
        await db.delete(userCredentials).where(eq(userCredentials.userId, existing.id));
        await db.delete(users).where(eq(users.id, existing.id));
    }

    // Hash password
    const hashedPassword = await authService.hashPassword(password);
    console.log("Password hashed.");

    // Create User
    const [newUser] = await db.insert(users).values({
        email,
        firstName,
        lastName,
        authProvider: 'local',
        emailVerified: true,
        displayName: `${firstName} ${lastName}`,
        role: 'creator',
        tenantRole: 'owner',
    }).returning();

    console.log(`User created with ID: ${newUser.id}`);

    // Create Credentials
    await userCredentialsRepository.createCredentials(newUser.id, hashedPassword);
    console.log("Credentials created.");

    // Verify
    const verifyUser = await userRepository.findByEmail(email);
    const verifyCreds = await userCredentialsRepository.findByUserId(newUser.id);

    if (!verifyUser || !verifyCreds) {
        console.error("Verification failed: User or credentials not found in DB.");
        process.exit(1);
    }

    const isMatch = await authService.comparePassword(password, verifyCreds.passwordHash);
    console.log(`Password comparison check: ${isMatch ? 'SUCCESS' : 'FAILURE'}`);

    if (isMatch) {
        console.log("\n>>> SUCCESS: User created and password verified internally.");
        console.log(`>>> You can now try logging in with:\nEmail: ${email}\nPassword: ${password}`);
    } else {
        console.error(">>> FAILURE: Password mismatch immediately after creation.");
    }

    process.exit(0);
}

main().catch(console.error);
