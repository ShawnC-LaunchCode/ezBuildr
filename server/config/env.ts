
import path from 'path';

import dotenv from 'dotenv';
import { z } from 'zod';

// ensure dotenv is loaded
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
    // Core functionality requirements
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().transform((val) => parseInt(val, 10)).default('5000'),
    DATABASE_URL: z.string().url().min(1, "DATABASE_URL is required"),

    // Authentication Secrets
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").default("development-jwt-not-secure-change-me-in-prod-12345"),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters").default("development-session-not-secure-change-me"),

    // External Services (Optional in Development/Test per logic, but strict types here help)
    // We make them optional or have defaults for dev/test ease
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),

    // Feature Flags / Configs
    VITEST_INTEGRATION: z.string().optional(),
    TEST_TYPE: z.string().optional(),
});

/**
 * Parses and validates environment variables.
 * In 'test' mode, we might allow looser validation or mocks if needed,
 * but generally we want strict validation to catch config errors early.
 */
function parseEnv() {
    const parsed = envSchema.safeParse(process.env);

    if (!parsed.success) {
        const errorMsg = `❌ Invalid environment variables: ${JSON.stringify(parsed.error.format(), null, 2)}`;

        // In production, we crash hard if items are invalid
        if (process.env.NODE_ENV === 'production') {
            console.error(errorMsg);
            throw new Error("Invalid environment configuration");
        } else {
            // In dev/test, we might warn but proceed if possible, OR crash if critical.
            // For now, let's warn.
            console.warn(errorMsg);
            // For type safety, we throw if parsing fails entirely, 
            // but maybe we want to allow partial processing? 
            // Creating a typed config is safer if we throw.
            throw new Error(`Invalid environment configuration: ${parsed.error.issues.map(i => `${i.path}: ${i.message}`).join(', ')}`);
        }
    }

    return parsed.data;
}

// Singleton export
export const env = parseEnv();
