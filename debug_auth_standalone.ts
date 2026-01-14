
import dotenv from "dotenv";
dotenv.config();

// Force test env
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

import { db, initializeDatabase } from "./server/db";
import { userRepository } from "./server/repositories/UserRepository";
import { userCredentialsRepository } from "./server/repositories/UserCredentialsRepository";
import { authService } from "./server/services/AuthService";
import crypto from "crypto";

async function run() {
    console.log("Starting Auth Debug Script...");
    console.log("DB URL:", process.env.DATABASE_URL?.split('@')[1]); // Log host only for safety

    await initializeDatabase();
    console.log("DB Initialized.");

    try {
        const email = `debug_${crypto.randomUUID()}@example.com`;
        const password = "StrongTestUser123!@#";
        const userId = crypto.randomUUID();

        console.log(`Creating user: ${email} (${userId})`);

        // 1. Create User
        const user = await userRepository.create({
            id: userId,
            email,
            firstName: "Debug",
            lastName: "User",
            role: "creator", // Fixed: 'viewer' is likely a tenant role, 'creator' is a system role
            authProvider: "local"
        });
        console.log("User created:", user.id);

        // 2. Hash Password
        console.log("Hashing password...");
        const hash = await authService.hashPassword(password);
        console.log("Hash created:", hash.substring(0, 10) + "...");

        // 3. Create Credentials
        console.log("Creating credentials...");
        await userCredentialsRepository.createCredentials(userId, hash);
        console.log("Credentials created.");

        // 4. Verify User Retrieval
        const fetchedUser = await userRepository.findByEmail(email);
        console.log("Fetched User:", fetchedUser ? "Found" : "NOT FOUND");

        // 5. Verify Credentials Retrieval
        const fetchedCreds = await userCredentialsRepository.findByUserId(userId);
        console.log("Fetched Credentials:", fetchedCreds ? "Found" : "NOT FOUND");

        if (fetchedUser && fetchedCreds) {
            // 6. Verify Password Match
            console.log("Verifying password match...");
            const isMatch = await authService.comparePassword(password, fetchedCreds.passwordHash);
            console.log("Password Match Result:", isMatch);

            if (isMatch) {
                console.log("SUCCESS: Auth logic works locally.");
            } else {
                console.error("FAILURE: Password did not match.");
            }
        } else {
            console.error("FAILURE: User or Credentials missing.");
        }

    } catch (e) {
        console.error("ERROR in script:", e);
    } finally {
        console.log("Exiting...");
        process.exit(0);
    }
}

run();
