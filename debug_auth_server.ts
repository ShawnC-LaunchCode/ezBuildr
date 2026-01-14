
import dotenv from "dotenv";
dotenv.config();

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

import express from 'express';
import { db, initializeDatabase } from "./server/db";
import { registerAuthRoutes } from "./server/routes/auth.routes";
import { registerAdminRoutes } from "./server/routes/admin.routes"; // optional
import { registerWorkflowsRoutes } from "./server/routes/workflows.routes"; // optional
import request from 'supertest';
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

async function run() {
    console.log("Starting Auth Server Debug...");
    await initializeDatabase();

    const app = express();
    app.use(express.json());

    // Register routes
    registerAuthRoutes(app);

    // Test Data
    const email = `server_debug_${crypto.randomUUID()}@example.com`;
    const password = "StrongTestUser123!@#";

    console.log(`Testing with User: ${email}`);

    // 1. Register
    console.log("--- REGISTER ---");
    const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
            email,
            password,
            firstName: "Debug",
            lastName: "Server",
            role: "creator" // auth.routes.ts ignores this anyway
        });

    console.log("Register Status:", registerRes.status);
    if (registerRes.status !== 201) {
        console.error("Register Failed:", registerRes.body);
        process.exit(1);
    }

    const userId = registerRes.body.user.id;
    console.log("User ID:", userId);

    // 2. Verify Email (Manual DB Update)
    console.log("--- VERIFY EMAIL (DB) ---");
    await db.update(users)
        .set({ emailVerified: true })
        .where(eq(users.id, userId));
    console.log("Email verified manually in DB.");

    // 3. Login
    console.log("--- LOGIN ---");
    const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
            email,
            password
        });

    console.log("Login Status:", loginRes.status);
    console.log("Login Body:", JSON.stringify(loginRes.body, null, 2));

    if (loginRes.status === 200) {
        console.log("SUCCESS: Login worked via App Routes!");
    } else {
        console.error("FAILURE: Login failed via App Routes.");
    }

    process.exit(0);
}

run().catch(console.error);
